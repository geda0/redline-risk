/** Command bar — the player's primary interface.
 *
 *  A chat log + a text input fixed to the bottom of the screen. You type
 *  orders ("recruit 3 to brazil", "attack peru from brazil"); Atlas
 *  confirms and narrates in the log. The log doubles as Atlas's voice
 *  transcript — every spoken line lands here too.
 *
 *  `/` or `t` focuses the input. ↑ recalls. Enter submits. */

export interface CommandBarHandlers {
  onSubmit: (raw: string) => void;
}

export class CommandBar {
  private root: HTMLDivElement;
  private input: HTMLInputElement;
  private logEl: HTMLDivElement;
  private history: string[] = [];
  private cursor = -1;
  private accepting = true;

  constructor(private handlers: CommandBarHandlers) {
    this.injectStyles();
    this.root = document.createElement("div");
    this.root.id = "command-bar";
    this.root.innerHTML = `
      <div id="cmd-log" aria-live="polite"></div>
      <div id="cmd-row">
        <span id="cmd-prompt">▌ ORDER</span>
        <input id="cmd-input" type="text" autocomplete="off" spellcheck="false"
               placeholder="recruit 3 to brazil   ·   attack peru from brazil   ·   done" />
        <span id="cmd-hint">[ / focus · ↑ recall · Enter send ]</span>
      </div>
    `;
    document.body.appendChild(this.root);
    this.input = this.root.querySelector("#cmd-input")!;
    this.logEl = this.root.querySelector("#cmd-log")!;
    this.bind();
  }

  /** Append a line. Tag prefixes ([atlas], [you], [battle], [enemy]) color it. */
  print(text: string) {
    const line = document.createElement("div");
    line.className = "cmd-line";
    if (text.startsWith("[atlas]")) line.classList.add("l-atlas");
    else if (text.startsWith("[you]")) line.classList.add("l-you");
    else if (text.startsWith("[battle]")) line.classList.add("l-battle");
    else if (text.startsWith("[enemy]")) line.classList.add("l-enemy");
    else if (text.startsWith("[error]")) line.classList.add("l-error");
    line.textContent = text;
    this.logEl.appendChild(line);
    while (this.logEl.children.length > 120) this.logEl.removeChild(this.logEl.firstChild!);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  focusInput() { this.input.focus(); }

  /** Pre-fill without submitting (used by example chips / suggestions). */
  prefill(text: string) {
    this.input.value = text;
    this.input.focus();
    this.input.setSelectionRange(text.length, text.length);
  }

  /** Voice transcripts route here so they go through the same pipeline. */
  submitFromVoice(text: string) { this.handlers.onSubmit(text); }

  setAccepting(open: boolean) {
    this.accepting = open;
    this.input.disabled = !open;
    this.root.classList.toggle("locked", !open);
    this.input.placeholder = open
      ? "recruit 3 to brazil   ·   attack peru from brazil   ·   done"
      : "the opponents are moving…";
  }

  private bind() {
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const v = this.input.value;
        this.input.value = "";
        this.cursor = -1;
        const t = v.trim();
        if (!t) return;
        if (!this.accepting) { this.print("[atlas] Stand by — not your turn."); return; }
        this.history.push(t);
        if (this.history.length > 60) this.history.shift();
        this.print(`[you] ${t}`);
        this.handlers.onSubmit(t);
      } else if (e.key === "Escape") {
        this.input.blur();
      } else if (e.key === "ArrowUp") {
        if (this.history.length === 0) return;
        this.cursor = Math.min(this.history.length - 1, this.cursor + 1);
        this.input.value = this.history[this.history.length - 1 - this.cursor] ?? "";
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        if (this.cursor <= 0) { this.cursor = -1; this.input.value = ""; }
        else { this.cursor--; this.input.value = this.history[this.history.length - 1 - this.cursor] ?? ""; }
        e.preventDefault();
      }
    });
    window.addEventListener("keydown", (e) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "/" || e.key === "t" || e.key === "T") {
        e.preventDefault();
        this.input.focus();
      }
    });
  }

  private injectStyles() {
    if (document.getElementById("command-bar-styles")) return;
    const s = document.createElement("style");
    s.id = "command-bar-styles";
    s.textContent = `
      #command-bar {
        position:absolute; left:0; right:240px; bottom:0; height:150px;
        display:flex; flex-direction:column; padding:6px 10px 8px;
        background:rgba(10,13,18,0.94); border-top:1px solid rgba(90,104,120,0.4);
        z-index:30;
      }
      #cmd-log {
        flex:1; overflow-y:auto; font-family:"SF Mono",Menlo,Consolas,monospace;
        font-size:11px; line-height:1.5; color:#cdd8e6; padding-bottom:4px;
      }
      .cmd-line { white-space:pre-wrap; word-break:break-word; }
      .l-atlas  { color:#6cd1ff; }
      .l-you    { color:#ffd95c; }
      .l-battle { color:#ff9b6c; }
      .l-enemy  { color:#ff8c8c; }
      .l-error  { color:#ff6b6b; }
      #cmd-row {
        display:flex; align-items:center; gap:8px;
        border-top:1px solid rgba(110,130,150,0.2); padding-top:6px;
      }
      #cmd-prompt { font-size:11px; color:#6cd1ff; font-weight:700; letter-spacing:0.05em; }
      #cmd-input {
        flex:1; background:rgba(20,26,36,0.7); border:1px solid rgba(120,140,180,0.35);
        color:#f5f5f5; padding:5px 9px; font-size:12px;
        font-family:"SF Mono",Menlo,Consolas,monospace; outline:none; border-radius:2px;
      }
      #cmd-input:focus { border-color:#ffd95c; }
      #cmd-input:disabled { opacity:0.45; cursor:not-allowed; }
      #command-bar.locked { border-top-color:rgba(255,90,90,0.4); }
      #cmd-hint { font-size:10px; color:rgba(180,195,215,0.5); flex:0 0 auto; }
    `;
    document.head.appendChild(s);
  }
}
