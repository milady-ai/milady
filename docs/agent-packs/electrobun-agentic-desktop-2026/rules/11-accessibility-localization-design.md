# 11 — Accessibility, Localization, and Design

## Accessibility

- Use semantic HTML before ARIA.
- Implement keyboard navigation, visible focus, and command palette shortcuts carefully.
- Label custom buttons and controls.
- Respect reduced motion and high contrast.
- Keep custom title bars/draggable regions accessible and operable.
- Add stable selectors/roles for UI tests.

## Localization

- Keep user-visible strings in a separable catalog/module.
- Do not hardcode user-visible prompt templates deep inside tools.
- Use `Intl` APIs for dates, numbers, currency, lists, relative time, and pluralization.
- Keep model prompts locale-aware only when product behavior requires it.

## Design

- Native-feeling desktop conventions: menus, shortcuts, drag regions, focus behavior, status/tray affordances.
- Clear AI affordances: what data is used, local vs cloud model, draft vs final output, side effects, and undo.
- Avoid modal surprises and hidden background work.
