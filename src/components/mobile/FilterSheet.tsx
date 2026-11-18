import { useState } from 'react';
import type { Subject } from '../../types';
import { SubjectSquare } from '../SubjectSquare';
import { Check } from '../icons';
import { Sheet } from './Sheet';

export type GroupBy = 'day' | 'subject';

export interface ListView {
  /** Subjects shown; empty means all. */
  subjects: Set<string>;
  groupBy: GroupBy;
  hideDone: boolean;
  details: boolean;
}

interface Props {
  subjects: Subject[];
  /** Items per subject, for the right-hand counts. */
  countFor: (id: string) => number;
  /** How many items a given view would show — the button's "Show 11 items". */
  countWith: (view: ListView) => number;
  value: ListView;
  onApply: (view: ListView) => void;
  onClose: () => void;
}

/**
 * "All subjects ▾" on the List opens this (frame 5f): one tick per subject,
 * Show all and Clear, and a button that says how many items the choice will
 * leave. Below the subjects sit the view toggles the redesign took off the
 * List's header — grouping, Hide done and Details — so none of them is lost.
 *
 * Changes are a draft until the button: closing with ✕ leaves the List as it
 * was, the way a filter sheet should.
 */
export function FilterSheet({ subjects, countFor, countWith, value, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<ListView>(value);
  const shownCount = draft.subjects.size === 0 ? subjects.length : draft.subjects.size;
  const n = countWith(draft);

  function toggle(id: string) {
    setDraft((d) => {
      // From "all", the first tap narrows to everything but this one.
      const base = d.subjects.size === 0 ? new Set(subjects.map((s) => s.id)) : new Set(d.subjects);
      if (base.has(id)) base.delete(id);
      else base.add(id);
      return { ...d, subjects: base.size === subjects.length ? new Set() : base };
    });
  }

  const isOn = (id: string) => draft.subjects.size === 0 || draft.subjects.has(id);

  return (
    <Sheet
      title="Show"
      subtitle={`${shownCount} of ${subjects.length} subjects`}
      action={{ label: `Show ${n} item${n === 1 ? '' : 's'}`, onClick: () => { onApply(draft); onClose(); } }}
      hideCancel
      onClose={onClose}
    >
      <div className="m-filter__links">
        <button type="button" className="m-textbtn" onClick={() => setDraft({ ...draft, subjects: new Set() })}>
          Show all
        </button>
        <button
          type="button"
          className="m-textbtn"
          // "Clear" ticks nothing; an empty pick still means "all" underneath,
          // so it is held as a set no subject can match until one is chosen.
          onClick={() => setDraft({ ...draft, subjects: new Set(['__none__']) })}
        >
          Clear
        </button>
      </div>

      <div className="m-rows">
        {subjects.map((s) => (
          <button
            key={s.id}
            type="button"
            className="m-checkrow"
            role="menuitemcheckbox"
            aria-checked={isOn(s.id)}
            onClick={() => {
              if (draft.subjects.has('__none__')) {
                setDraft({ ...draft, subjects: new Set([s.id]) });
              } else {
                toggle(s.id);
              }
            }}
          >
            <SubjectSquare hue={s.hue} />
            <span className="m-checkrow__name">{s.name}</span>
            <span className="m-checkrow__count">{countFor(s.id)}</span>
            <span className="m-checkrow__box" data-on={isOn(s.id)} aria-hidden="true">
              {isOn(s.id) && <Check strokeWidth={1.6} />}
            </span>
          </button>
        ))}
      </div>

      <span className="m-label">View</span>
      <div className="m-form__pad m-filter__view">
        <div className="m-seg m-seg--form" role="group" aria-label="Group by">
          {(['day', 'subject'] as GroupBy[]).map((g) => (
            <button
              key={g}
              type="button"
              className="m-seg__opt"
              data-active={draft.groupBy === g}
              aria-pressed={draft.groupBy === g}
              onClick={() => setDraft({ ...draft, groupBy: g })}
            >
              By {g === 'day' ? 'day' : 'subject'}
            </button>
          ))}
        </div>
      </div>
      <div className="m-rows">
        <button type="button" className="m-checkrow" role="menuitemcheckbox"
          aria-checked={draft.hideDone}
          onClick={() => setDraft({ ...draft, hideDone: !draft.hideDone })}>
          <span className="m-checkrow__name m-checkrow__name--plain">Hide done</span>
          <span className="m-checkrow__box" data-on={draft.hideDone} aria-hidden="true">
            {draft.hideDone && <Check strokeWidth={1.6} />}
          </span>
        </button>
        <button type="button" className="m-checkrow" role="menuitemcheckbox"
          aria-checked={draft.details}
          onClick={() => setDraft({ ...draft, details: !draft.details })}>
          <span className="m-checkrow__name m-checkrow__name--plain">Show details</span>
          <span className="m-checkrow__box" data-on={draft.details} aria-hidden="true">
            {draft.details && <Check strokeWidth={1.6} />}
          </span>
        </button>
      </div>
    </Sheet>
  );
}
