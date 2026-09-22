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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![drag_window])
        .run(tauri::generate_context!())
        .expect("error while running the Weekly Planner");
}
