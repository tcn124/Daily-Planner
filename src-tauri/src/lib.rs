/// Starts an OS-level drag of the window, for a frameless title bar drawn in
/// the webview.
///
/// Tauri's own `start_dragging` hands macOS whatever `NSApp.currentEvent`
/// happens to be when the request arrives from JavaScript, and only builds a
/// proper mouse-down for one specific event type. Anything else dequeued in
/// between — and a trackpad follows every mouse-down with pressure events
/// within milliseconds — means macOS is given the wrong event and quietly
/// does nothing. So this always synthesises a fresh left-mouse-down at the
/// cursor's current position and hands *that* to `performWindowDragWithEvent`.
#[tauri::command]
fn drag_window(window: tauri::Window) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // A raw NSWindow pointer is not Send, but the closure only runs on the
        // main thread, which is the only place AppKit may be touched anyway.
        struct WindowPtr(*mut std::ffi::c_void);
        unsafe impl Send for WindowPtr {}
        impl WindowPtr {
            // Going through a method makes the closure capture the whole
            // wrapper; a direct field access would capture only the raw
            // pointer and lose the Send impl (edition-2021 disjoint capture).
            fn get(&self) -> *mut std::ffi::c_void {
                self.0
            }
        }

        let ptr = WindowPtr(window.ns_window().map_err(|e| e.to_string())?);
        window
            .run_on_main_thread(move || unsafe {
                use objc2_app_kit::{NSEvent, NSEventModifierFlags, NSEventType, NSWindow};
                let ns_window: &NSWindow = &*(ptr.get() as *const NSWindow);
                // The event's location is the drag's grab point and is read in
                // window coordinates; `mouseLocation` is in screen coordinates.
                let location = ns_window.convertPointFromScreen(NSEvent::mouseLocation());
                let event = NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
                    NSEventType::LeftMouseDown,
                    location,
                    NSEventModifierFlags::empty(),
                    0.0,
                    ns_window.windowNumber(),
                    None,
                    0,
                    1,
                    1.0,
                );
                if let Some(event) = event {
                    ns_window.performWindowDragWithEvent(&event);
                }
            })
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        window.start_dragging().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// One line of text found in an image, with its bounding box normalised to
/// 0–1 and measured from the top-left corner, as CSS would. Vision reports
/// boxes from the bottom-left; the flip happens here so the frontend never
/// has to know.
#[derive(serde::Serialize)]
pub struct OcrLine {
    text: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

/// Runs Vision's text recogniser over encoded image data (PNG, JPEG, TIFF…).
///
/// Vision is thread-safe (unlike AppKit), so this runs on whatever thread
/// Tauri hands the command; a second or two of recognition never blocks the UI.
#[cfg(target_os = "macos")]
fn recognize(data: &objc2_foundation::NSData) -> Result<Vec<OcrLine>, String> {
    use objc2::rc::Retained;
    use objc2::AnyThread;
    use objc2_foundation::{NSArray, NSDictionary};
    use objc2_vision::{
        VNImageRequestHandler, VNRecognizeTextRequest, VNRequest, VNRequestTextRecognitionLevel,
    };

    let handler = VNImageRequestHandler::initWithData_options(
        VNImageRequestHandler::alloc(),
        data,
        &NSDictionary::new(),
    );

    let request = VNRecognizeTextRequest::new();
    request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
    request.setUsesLanguageCorrection(true);

    // VNRecognizeTextRequest → VNImageBasedRequest → VNRequest.
    let as_base: Retained<VNRequest> = Retained::into_super(Retained::into_super(request.clone()));
    let requests = NSArray::from_retained_slice(&[as_base]);
    handler
        .performRequests_error(&requests)
        .map_err(|e| e.localizedDescription().to_string())?;

    let Some(observations) = request.results() else {
        return Ok(Vec::new());
    };
    let mut lines = Vec::with_capacity(observations.len());
    for observation in observations.iter() {
        let Some(best) = observation.topCandidates(1).firstObject() else {
            continue;
        };
        let rect = unsafe { observation.boundingBox() };
        lines.push(OcrLine {
            text: best.string().to_string(),
            x: rect.origin.x,
            // Top edge, measured downward from the top of the image.
            y: 1.0 - rect.origin.y - rect.size.height,
            w: rect.size.width,
            h: rect.size.height,
        });
    }
    Ok(lines)
}

/// The image or document arrives as the raw request body rather than a JSON
/// array of bytes, which would be ten times the size and slow to parse. That
/// needs the fetch-based IPC, which the CSP's `connect-src` must allow
/// (`ipc: http://ipc.localhost`); the postMessage fallback can only carry JSON.
fn raw_body<'a>(request: &'a tauri::ipc::Request<'_>) -> Result<&'a [u8], String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected the file as a raw request body.".into());
    };
    if bytes.is_empty() {
        return Err("The file was empty.".into());
    }
    Ok(bytes)
}

/// Reads every line of text out of an image, entirely on-device.
#[tauri::command]
fn ocr_image(request: tauri::ipc::Request<'_>) -> Result<Vec<OcrLine>, String> {
    let bytes = raw_body(&request)?;
    #[cfg(target_os = "macos")]
    {
        recognize(&objc2_foundation::NSData::with_bytes(bytes))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = bytes;
        Err("Screenshot import is only available on macOS.".into())
    }
}

/// Longest side of a rasterised PDF page, in pixels. Enough for Vision to
/// read 9pt body text on a letter page; more only slows recognition down.
const PDF_RASTER_PX: f64 = 2400.0;

/// Pages beyond this are ignored. A syllabus is a handful of pages; a whole
/// textbook would take minutes and is never what was meant.
const PDF_MAX_PAGES: usize = 40;

/// Reads every page of a PDF, one `Vec<OcrLine>` per page. Pages are
/// rasterised through PDFKit and go through the same recogniser as
/// screenshots — a syllabus PDF and a screenshot of it then parse identically.
#[tauri::command]
fn ocr_pdf(request: tauri::ipc::Request<'_>) -> Result<Vec<Vec<OcrLine>>, String> {
    let bytes = raw_body(&request)?;
    #[cfg(target_os = "macos")]
    {
        use objc2::AnyThread;
        use objc2_foundation::{NSData, NSSize};
        use objc2_pdf_kit::{PDFDisplayBox, PDFDocument};

        let data = NSData::with_bytes(bytes);
        let document = unsafe { PDFDocument::initWithData(PDFDocument::alloc(), &data) }
            .ok_or("That file is not a readable PDF.")?;
        let count = unsafe { document.pageCount() }.min(PDF_MAX_PAGES);
        let mut pages = Vec::with_capacity(count);
        for index in 0..count {
            let Some(page) = (unsafe { document.pageAtIndex(index) }) else {
                continue;
            };
            let bounds = unsafe { page.boundsForBox(PDFDisplayBox::MediaBox) };
            let scale = PDF_RASTER_PX / bounds.size.width.max(bounds.size.height).max(1.0);
            let size = NSSize::new(bounds.size.width * scale, bounds.size.height * scale);
            let image = unsafe { page.thumbnailOfSize_forBox(size, PDFDisplayBox::MediaBox) };
            let Some(tiff) = image.TIFFRepresentation() else {
                continue;
            };
            pages.push(recognize(&tiff)?);
        }
        Ok(pages)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = bytes;
        Err("PDF import is only available on macOS.".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![drag_window, ocr_image, ocr_pdf])
        .run(tauri::generate_context!())
        .expect("error while running the Weekly Planner");
}
