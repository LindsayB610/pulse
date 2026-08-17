export const pulseStyles = `
.pulse-ui {
  --pulse-canvas: var(--workshop-canvas, #000000);
  --pulse-surface: var(--workshop-surface, rgba(255,255,255,.045));
  --pulse-surface-raised: var(--workshop-surface-raised, #151519);
  --pulse-border: var(--workshop-border, rgba(255,255,255,.11));
  --pulse-text: var(--workshop-text, #f7f7f8);
  --pulse-strong-text: var(--workshop-text, #ffffff);
  --pulse-text-muted: var(--workshop-text-muted, #9f9fa8);
  --pulse-accent: var(--workshop-accent, #ff2f92);
  --pulse-accent-strong: var(--workshop-accent-strong, #ff2f92);
  --pulse-accent-warm: var(--workshop-accent-warm, #ffe600);
  --pulse-focus-ring: var(--workshop-focus-ring, rgba(255,230,0,.82));
  --pulse-success: var(--workshop-success, #5ee49b);
  --pulse-warning: var(--workshop-warning, #ffe600);
  --pulse-danger: var(--workshop-danger, #ff8dbd);
  --pulse-control-surface: var(--workshop-surface-raised, rgba(255,255,255,.055));
  --pulse-control-surface-hover: var(--workshop-surface-raised, rgba(255,255,255,.095));
  --pulse-tab-hover-surface: var(--workshop-surface-raised, rgba(255,255,255,.06));
  --pulse-control-border-hover: var(--workshop-border, rgba(255,255,255,.2));
  --pulse-badge-border: var(--workshop-border, rgba(255,255,255,.12));
  --pulse-input-surface: var(--workshop-surface-raised, #111115);
  --pulse-input-border: var(--workshop-border, rgba(255,255,255,.15));
  --pulse-input-border-hover: var(--workshop-border, rgba(255,255,255,.27));
  --pulse-field-text: var(--workshop-text, #e8e8ea);
  --pulse-schedule-text: var(--workshop-text, #d5d5d9);
  --pulse-code-text: var(--workshop-text, #d8d8dc);
  --pulse-on-action: var(--workshop-canvas, #08080a);
  --pulse-alert: var(--workshop-danger, #ff98c4);
  --pulse-timing-surface: var(--workshop-canvas, rgba(0,0,0,.16));
  --pulse-preset-surface: var(--workshop-surface-raised, rgba(255,255,255,.035));
  --pulse-modal-border: var(--workshop-border, rgba(255,255,255,.16));
  --pulse-host-hover-highlight: var(--workshop-text, transparent);
  --pulse-accent-soft: color-mix(in srgb, var(--pulse-accent) 14%, transparent);
  --pulse-accent-border: color-mix(in srgb, var(--pulse-accent-strong) 42%, transparent);
  --pulse-accent-border-strong: color-mix(in srgb, var(--workshop-accent-strong, #ff2f92) 45%, transparent);
  --pulse-warning-soft: color-mix(in srgb, var(--pulse-warning) 8%, transparent);
  --pulse-warning-border: color-mix(in srgb, var(--pulse-warning) 30%, transparent);
  --pulse-success-soft: color-mix(in srgb, var(--pulse-success) 10%, transparent);
  --pulse-success-halo: color-mix(in srgb, var(--workshop-success, #5ee49b) 11%, transparent);
  --pulse-danger-border: color-mix(in srgb, var(--workshop-danger, #ff2f92) 34%, transparent);
  width: min(100%, 1040px);
  background: var(--pulse-canvas);
  color: var(--pulse-text);
  font: inherit;
}
.pulse-ui, .pulse-ui * { box-sizing: border-box; }
.pulse-ui button, .pulse-ui input, .pulse-ui select { font: inherit; }
.pulse-ui button { color: inherit; }
.pulse-ui :focus-visible { outline: 3px solid var(--pulse-focus-ring); outline-offset: 3px; }
.pulse-ui__nav { display: flex; gap: 6px; padding: 0 0 26px; border-bottom: 1px solid var(--pulse-border); }
.pulse-ui__tab { border: 0; border-radius: 999px; background: transparent; color: var(--pulse-text-muted); padding: 9px 15px; cursor: pointer; font-weight: 700; }
.pulse-ui__tab:hover { color: var(--pulse-text); background: var(--pulse-tab-hover-surface); }
.pulse-ui__tab[aria-current='page'] { color: var(--pulse-strong-text); background: var(--pulse-accent-soft); box-shadow: inset 0 0 0 1px var(--pulse-accent-border); }
.pulse-ui__refresh { margin-left: auto; }
.pulse-ui__refresh, .pulse-ui__button--icon { display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
.pulse-ui__page { padding-top: 30px; }
.pulse-ui__page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 26px; }
.pulse-ui__eyebrow { color: var(--pulse-accent); font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; margin: 0 0 8px; }
.pulse-ui h2, .pulse-ui h3, .pulse-ui p { margin-top: 0; }
.pulse-ui h2 { font-size: clamp(25px, 3vw, 34px); letter-spacing: -.035em; margin-bottom: 8px; }
.pulse-ui h3 { font-size: 18px; letter-spacing: -.015em; margin-bottom: 5px; }
.pulse-ui__lede, .pulse-ui__muted { color: var(--pulse-text-muted); line-height: 1.55; }
.pulse-ui__lede { margin-bottom: 0; max-width: 610px; }
.pulse-ui__lede--wide { max-width: 780px; }
.pulse-ui__button { min-height: 42px; border: 1px solid var(--pulse-border); border-radius: 11px; background: var(--pulse-control-surface); padding: 9px 14px; cursor: pointer; font-weight: 750; transition: background .15s ease, border-color .15s ease, transform .15s ease; }
.pulse-ui__button:hover { background: var(--pulse-control-surface-hover); border-color: var(--pulse-control-border-hover); box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--pulse-host-hover-highlight) 6%, transparent); }
.pulse-ui__button:active { transform: translateY(1px); }
.pulse-ui__button:disabled { cursor: not-allowed; opacity: .45; transform: none; }
.pulse-ui__button:disabled:hover { background: var(--pulse-control-surface); border-color: var(--pulse-border); }
.pulse-ui__button--primary { color: var(--pulse-on-action) !important; border-color: var(--pulse-accent-warm); background: var(--pulse-accent-warm); box-shadow: 0 7px 24px color-mix(in srgb, var(--pulse-accent-warm) 14%, transparent); }
.pulse-ui__button--primary:hover { background: var(--workshop-accent-warm, #fff04a); box-shadow: 0 7px 24px color-mix(in srgb, var(--pulse-accent-warm) 14%, transparent), inset 0 0 0 999px color-mix(in srgb, var(--pulse-host-hover-highlight) 8%, transparent); }
.pulse-ui__button.pulse-ui__button--danger { color: var(--pulse-danger); border-color: var(--pulse-danger-border); }
.pulse-ui__stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 28px; }
.pulse-ui__stat, .pulse-ui__card, .pulse-ui__panel { border: 1px solid var(--pulse-border); background: var(--pulse-surface); border-radius: 16px; }
.pulse-ui__stat { padding: 17px 18px; min-height: 96px; }
.pulse-ui__stat-label { display: block; color: var(--pulse-text-muted); font-size: 12px; font-weight: 750; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 9px; }
.pulse-ui__stat-value { display: block; font-size: 19px; font-weight: 800; letter-spacing: -.02em; }
.pulse-ui__status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; background: var(--pulse-success); box-shadow: 0 0 0 4px var(--pulse-success-halo); }
.pulse-ui__section-label { color: var(--pulse-text-muted); font-size: 13px; font-weight: 750; margin: 0 0 11px; }
.pulse-ui__list { display: grid; gap: 12px; }
.pulse-ui__card { display: flex; justify-content: space-between; gap: 24px; padding: 19px 20px; }
.pulse-ui__card--paused .pulse-ui__card-main { opacity: .68; }
.pulse-ui__card-main { min-width: 0; }
.pulse-ui__card-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; }
.pulse-ui__badge { display: inline-flex; align-items: center; border: 1px solid var(--pulse-badge-border); border-radius: 999px; color: var(--pulse-text-muted); padding: 4px 8px; font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
.pulse-ui__badge--due { color: var(--pulse-warning); border-color: var(--pulse-warning-border); background: var(--pulse-warning-soft); }
.pulse-ui__badge--success { color: var(--pulse-success); border-color: var(--pulse-success); background: var(--pulse-success-soft); }
.pulse-ui__badge--warning { color: var(--pulse-warning); border-color: var(--pulse-warning-border); background: var(--pulse-warning-soft); }
.pulse-ui__schedule { margin: 8px 0 6px; color: var(--pulse-schedule-text); }
.pulse-ui__policy { margin: 0; color: var(--pulse-text-muted); font-size: 13px; }
.pulse-ui__actions { align-self: center; display: flex; gap: 8px; flex: 0 0 auto; }
.pulse-ui__empty { text-align: center; padding: 48px 24px; }
.pulse-ui__empty-mark { width: 48px; height: 48px; display: grid; place-items: center; margin: 0 auto 16px; border-radius: 50%; color: var(--pulse-accent); background: var(--pulse-accent-soft); }
.pulse-ui__panel { padding: 22px; }
.pulse-ui__form { display: grid; gap: 22px; }
.pulse-ui__field { display: grid; gap: 8px; color: var(--pulse-field-text); font-weight: 700; }
.pulse-ui__field small { color: var(--pulse-text-muted); font-weight: 450; line-height: 1.45; }
.pulse-ui__field input, .pulse-ui__field select { width: 100%; min-height: 45px; border: 1px solid var(--pulse-input-border); border-radius: 11px; color: var(--pulse-strong-text); background: var(--pulse-input-surface); padding: 10px 12px; }
.pulse-ui__field input:hover, .pulse-ui__field select:hover { border-color: var(--pulse-input-border-hover); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--pulse-host-hover-highlight) 12%, transparent); }
.pulse-ui__form-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px; }
.pulse-ui__timing-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
.pulse-ui__timing-grid--single { grid-template-columns: minmax(0, 1fr); }
.pulse-ui__timing { border: 1px solid var(--pulse-border); border-radius: 14px; padding: 16px; background: var(--pulse-timing-surface); }
.pulse-ui__timing h3 { font-size: 15px; }
.pulse-ui__timing p { color: var(--pulse-text-muted); font-size: 13px; line-height: 1.45; min-height: 38px; }
.pulse-ui__presets { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 13px; }
.pulse-ui__preset { border: 1px solid var(--pulse-border); border-radius: 999px; background: var(--pulse-preset-surface); padding: 6px 9px; cursor: pointer; color: var(--pulse-text-muted) !important; font-size: 12px !important; font-weight: 750; }
.pulse-ui__preset[aria-pressed='true'] { color: var(--pulse-strong-text) !important; border-color: var(--pulse-accent-border-strong); background: var(--pulse-accent-soft); }
.pulse-ui__form-actions { display: flex; justify-content: space-between; gap: 12px; padding-top: 4px; }
.pulse-ui__form-actions-group { display: flex; gap: 8px; }
.pulse-ui__history-row { display: grid; grid-template-columns: 34px minmax(0,1fr) auto; gap: 13px; align-items: center; padding: 16px 0; border-bottom: 1px solid var(--pulse-border); }
.pulse-ui__history-row:last-child { border-bottom: 0; }
.pulse-ui__history-icon { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; color: var(--pulse-success); background: var(--pulse-success-soft); font-weight: 900; }
.pulse-ui__history-meta { color: var(--pulse-text-muted); font-size: 13px; }
.pulse-ui__settings { display: grid; gap: 12px; }
.pulse-ui__setting { display: flex; justify-content: space-between; gap: 30px; align-items: center; padding: 19px 20px; border: 1px solid var(--pulse-border); border-radius: 15px; background: var(--pulse-surface); }
.pulse-ui__setting p { color: var(--pulse-text-muted); margin: 5px 0 0; font-size: 13px; line-height: 1.5; }
.pulse-ui__setting code { display: block; max-width: 420px; color: var(--pulse-code-text); overflow-wrap: anywhere; font-size: 12px; }
.pulse-ui__setting-main { min-width: 0; flex: 1; }
.pulse-ui__setting-actions { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
.pulse-ui__folder-editor { display: grid; gap: 14px; margin-top: 18px; }
.pulse-ui__folder-editor .pulse-ui__form-actions-group { justify-content: flex-end; }
.pulse-ui__invitation { display: grid; gap: 6px; padding: 14px; border: 1px solid var(--pulse-success); border-radius: 11px; background: var(--pulse-success-soft); }
.pulse-ui__invitation code { max-width: none; color: var(--pulse-text); font-size: 14px; }
.pulse-ui__invitation small { color: var(--pulse-text-muted); }
.pulse-ui__invitation .pulse-ui__text-button { justify-self: start; margin-top: 4px; }
.pulse-ui__setting--clients { align-items: flex-start; }
.pulse-ui__client-list { display: grid; gap: 8px; margin-top: 14px; }
.pulse-ui__client-list > div { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 12px 0; border-top: 1px solid var(--pulse-border); }
.pulse-ui__client-list strong, .pulse-ui__client-list small { display: block; }
.pulse-ui__client-list small { margin-top: 3px; color: var(--pulse-text-muted); }
.pulse-ui__disconnect-warning { max-width: 650px; margin-top: 16px; padding: 16px; border: 1px solid var(--pulse-danger-border); border-radius: 12px; background: color-mix(in srgb, var(--pulse-danger) 7%, transparent); }
.pulse-ui__disconnect-warning > p { margin: 6px 0 16px; }
.pulse-ui__notice { margin-top: 18px; color: var(--pulse-text-muted); font-size: 13px; }
.pulse-ui__notice[role='alert'] { color: var(--pulse-alert); }
.pulse-ui__connect { max-width: 700px; padding: 34px; }
.pulse-ui__connect .pulse-ui__field { margin: 24px 0 16px; }
.pulse-ui__connect-actions { display: flex; justify-content: flex-end; }
.pulse-ui__setup { width: 100%; min-height: 640px; border: 1px solid var(--pulse-border); border-radius: 22px; overflow: hidden; background: var(--pulse-surface); }
.pulse-ui__setup-top { display: flex; align-items: center; justify-content: space-between; min-height: 68px; padding: 0 30px; border-bottom: 1px solid var(--pulse-border); }
.pulse-ui__setup-brand { display: inline-flex; align-items: center; gap: 11px; color: var(--pulse-strong-text); font-weight: 800; }
.pulse-ui__setup-mark { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; color: var(--pulse-on-action); background: var(--pulse-accent); font-size: 14px; font-weight: 950; }
.pulse-ui__text-button { display: inline-flex; align-items: center; gap: 6px; width: fit-content; border: 0; padding: 5px 0; color: var(--pulse-text-muted) !important; background: transparent; cursor: pointer; font-weight: 700; text-decoration: none; }
.pulse-ui__text-button:hover, .pulse-ui__text-link:hover { color: var(--pulse-text) !important; }
.pulse-ui__text-link { color: var(--pulse-text-muted); font-weight: 700; text-decoration: none; }
.pulse-ui__setup-progress { padding: 20px 30px 0; }
.pulse-ui__setup-progress > div:first-child { display: flex; justify-content: space-between; color: var(--pulse-text-muted); font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.pulse-ui__setup-progress strong { color: var(--pulse-text); }
.pulse-ui__setup-track { height: 4px; margin-top: 10px; overflow: hidden; border-radius: 999px; background: var(--pulse-border); }
.pulse-ui__setup-track span { display: block; height: 100%; border-radius: inherit; background: var(--pulse-accent); transition: width .2s ease; }
.pulse-ui__setup-main { width: min(100%, 800px); min-height: 510px; padding: 52px 54px 64px; }
.pulse-ui__setup-main h2 { max-width: 760px; font-size: clamp(34px, 5vw, 58px); line-height: 1.02; letter-spacing: -.055em; margin-bottom: 18px; }
.pulse-ui__setup-lede { max-width: 720px; color: var(--pulse-text-muted); font-size: 18px; line-height: 1.58; }
.pulse-ui__back { display: inline-flex; align-items: center; gap: 5px; margin: -18px 0 34px; border: 0; padding: 4px 0; color: var(--pulse-text-muted) !important; background: transparent; cursor: pointer; font-weight: 750; }
.pulse-ui__back:hover { color: var(--pulse-text) !important; }
.pulse-ui__promise-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 34px 0; }
.pulse-ui__promise-grid > div { padding: 18px; border: 1px solid var(--pulse-border); border-radius: 14px; background: var(--pulse-timing-surface); }
.pulse-ui__promise-grid strong, .pulse-ui__promise-grid span { display: block; }
.pulse-ui__promise-grid span { margin-top: 6px; color: var(--pulse-text-muted); font-size: 13px; line-height: 1.45; }
.pulse-ui__setup-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 34px; }
.pulse-ui__button--large { min-height: 52px; padding: 13px 20px; }
.pulse-ui__done-when { display: grid; grid-template-columns: 38px minmax(0,1fr); gap: 13px; max-width: 680px; margin-top: 30px; padding: 17px 18px; border: 1px solid var(--pulse-success); border-radius: 14px; background: var(--pulse-success-soft); }
.pulse-ui__done-when > span { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; color: var(--pulse-canvas); background: var(--pulse-success); font-weight: 950; }
.pulse-ui__done-when strong { color: var(--pulse-success); }
.pulse-ui__done-when p { margin: 4px 0 0; color: var(--pulse-text-muted); line-height: 1.45; }
.pulse-ui__done-when .pulse-ui__text-button { margin-top: 8px; }
.pulse-ui__existing { display: grid; gap: 24px; max-width: 680px; margin-top: 30px; }
.pulse-ui__existing > .pulse-ui__done-when, .pulse-ui__existing > .pulse-ui__setup-form { margin-top: 0; }
.pulse-ui__existing > .pulse-ui__button { justify-self: start; }
.pulse-ui__topic { display: block; max-width: 680px; margin-top: 28px; padding: 15px 17px; border: 1px solid var(--pulse-border); border-radius: 12px; color: var(--pulse-code-text); background: var(--pulse-input-surface); overflow-wrap: anywhere; }
.pulse-ui__done-when .pulse-ui__topic { margin-top: 10px; }
.pulse-ui__choice-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; margin-top: 34px; }
.pulse-ui__choice { min-height: 200px; padding: 24px; text-align: left; border: 1px solid var(--pulse-border); border-radius: 18px; background: var(--pulse-timing-surface); cursor: pointer; }
.pulse-ui__choice:hover { border-color: var(--pulse-accent-border-strong); background: var(--pulse-accent-soft); }
.pulse-ui__choice strong, .pulse-ui__choice span { display: block; }
.pulse-ui__choice strong { color: var(--pulse-strong-text); font-size: 20px; }
.pulse-ui__choice span { margin: 8px 0 20px; color: var(--pulse-accent); font-size: 12px; font-weight: 850; letter-spacing: .07em; text-transform: uppercase; }
.pulse-ui__choice p { color: var(--pulse-text-muted); line-height: 1.5; }
.pulse-ui__setup-form { display: grid; gap: 20px; max-width: 680px; margin-top: 32px; }
.pulse-ui__notice--success { width: fit-content; padding: 12px 14px; border: 1px solid var(--pulse-success); border-radius: 10px; color: var(--pulse-success); background: var(--pulse-success-soft); }
.pulse-ui__notice--error { width: fit-content; padding: 12px 14px; border: 1px solid var(--pulse-danger-border); border-radius: 10px; background: color-mix(in srgb, var(--pulse-danger) 8%, transparent); }
.pulse-ui__modal-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; background: color-mix(in srgb, var(--workshop-canvas, #000000) 72%, transparent); backdrop-filter: blur(5px); }
.pulse-ui__modal { width: min(100%, 470px); padding: 25px; border: 1px solid var(--pulse-modal-border); border-radius: 18px; color: var(--pulse-text); background: var(--pulse-surface-raised); box-shadow: 0 24px 80px color-mix(in srgb, var(--workshop-canvas, #000000) 52%, transparent); }
.pulse-ui__modal-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 24px; }
@media (max-width: 720px) {
  .pulse-ui__page-head, .pulse-ui__card, .pulse-ui__setting { align-items: stretch; flex-direction: column; }
  .pulse-ui__stats, .pulse-ui__form-grid, .pulse-ui__timing-grid { grid-template-columns: 1fr; }
  .pulse-ui__actions { align-self: stretch; }
  .pulse-ui__actions .pulse-ui__button { flex: 1; }
  .pulse-ui__setting-actions { justify-content: space-between; }
  .pulse-ui__history-row { grid-template-columns: 34px minmax(0,1fr); }
  .pulse-ui__history-meta { grid-column: 2; }
  .pulse-ui__setup-main { padding: 38px 24px 50px; }
  .pulse-ui__setup-top, .pulse-ui__setup-progress { padding-left: 22px; padding-right: 22px; }
  .pulse-ui__promise-grid, .pulse-ui__choice-grid { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) { .pulse-ui__setup-track span { transition: none; } }
`;
