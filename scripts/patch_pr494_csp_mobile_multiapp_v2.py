from pathlib import Path


def replace_once(path: Path, old: str, new: str, contract: str) -> None:
    source = path.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{contract}: expected 1 anchor, found {count}")
    path.write_text(source.replace(old, new, 1))


index_path = Path("public/m26/index.html")
inline = """  <style data-iberfit-mobile-nav-critical>
  @media (max-width: 900px) {
    .m26-shell > .m26-workspace {
      padding-bottom: calc(var(--iberfit-ux-mobile-nav, 4.35rem) + env(safe-area-inset-bottom));
    }
    .m26-shell > .m26-workspace > .m26-mobile-nav {
      /* This rail must win over legacy late mobile rules that once reset it to relative. */
      position: fixed !important;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      max-width: 100vw;
      z-index: 60;
    }
  }
  </style>
"""
replace_once(index_path, inline, "", "INDEX_MOBILE_INLINE_STYLE_CONTRACT_MISMATCH")
index = index_path.read_text()
if index.count("<style") != 1 or "data-iberfit-mobile-nav-critical" in index:
    raise SystemExit("INDEX_CSP_SINGLE_INLINE_STYLE_NOT_RESTORED")

shell_path = Path("src/m26/shell/shell.css")
replace_once(
    shell_path,
    "  .m26-workspace { min-height: 100dvh; display: flex; flex-direction: column; }",
    "  .m26-workspace { min-height: 100dvh; display: flex; flex-direction: column; padding-bottom: calc(var(--iberfit-ux-mobile-nav, 4.35rem) + env(safe-area-inset-bottom)); }",
    "MOBILE_WORKSPACE_SAFE_AREA_CONTRACT_MISMATCH",
)
replace_once(
    shell_path,
    "  .m26-mobile-nav { display: grid; position: sticky; bottom: 0; z-index: 60; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .3rem; padding: .5rem max(.5rem, env(safe-area-inset-right)) max(.5rem, env(safe-area-inset-bottom)) max(.5rem, env(safe-area-inset-left)); border-top: 1px solid var(--m26-line); background: rgba(7, 21, 15, .96); }",
    "  .m26-mobile-nav { display: grid; position: fixed; left: 0; right: 0; bottom: 0; width: 100%; max-width: 100vw; box-sizing: border-box; z-index: 60; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .3rem; padding: .5rem max(.5rem, env(safe-area-inset-right)) max(.5rem, env(safe-area-inset-bottom)) max(.5rem, env(safe-area-inset-left)); border-top: 1px solid var(--m26-line); background: rgba(7, 21, 15, .96); }",
    "MOBILE_NAV_CANONICAL_RULE_CONTRACT_MISMATCH",
)
replace_once(
    shell_path,
    """@media (max-width: 900px) {
  .m26-mobile-nav { position: relative; z-index: 60; isolation: isolate; }
  .m26-mobile-more-menu { z-index: 70; }
}""",
    """@media (max-width: 900px) {
  /* Viewport position is owned by the canonical mobile rule above. Never reset it after long route content. */
  .m26-mobile-nav { z-index: 60; isolation: isolate; }
  .m26-mobile-more-menu { z-index: 70; }
}""",
    "MOBILE_NAV_LATE_RELATIVE_OVERRIDE_CONTRACT_MISMATCH",
)
shell = shell_path.read_text()
if "position: relative; z-index: 60; isolation: isolate;" in shell:
    raise SystemExit("MOBILE_NAV_RELATIVE_OVERRIDE_STILL_PRESENT")

nav_test = Path("tests/m26_mobile_navigation_persistence.test.mjs")
nav_test.write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/m26/index.html',import.meta.url),'utf8');
const shellCss=fs.readFileSync(new URL('../src/m26/shell/shell.css',import.meta.url),'utf8');

test('mobile authenticated navigation stays viewport anchored on long routes without weakening CSP',()=>{
  assert.doesNotMatch(html,/data-iberfit-mobile-nav-critical/u);
  assert.equal([...html.matchAll(/<style\\b/giu)].length,1,'authenticated navigation must not add inline CSS beyond the canonical preauth style');
  assert.match(
    shellCss,
    /\\.m26-mobile-nav\\s*\\{[^}]*display:\\s*grid;[^}]*position:\\s*fixed;[^}]*left:\\s*0;[^}]*right:\\s*0;[^}]*bottom:\\s*0;[^}]*width:\\s*100%;[^}]*max-width:\\s*100vw;/su,
  );
  assert.match(
    shellCss,
    /\\.m26-workspace\\s*\\{[^}]*padding-bottom:\\s*calc\\(var\\(--iberfit-ux-mobile-nav,\\s*4\\.35rem\\)\\s*\\+\\s*env\\(safe-area-inset-bottom\\)\\);/su,
  );
  assert.doesNotMatch(
    shellCss,
    /\\.m26-mobile-nav\\s*\\{[^}]*position:\\s*relative/su,
    'later mobile rules must never move the persistent rail back into document flow',
  );
});
""")

onboarding = Path("tests/m26_onboarding_app_choice_gate.test.mjs")
replace_once(
    onboarding,
    "  assert.match(application,/const roleChoiceConfirmed=identity\\.roleChoiceConfirmed!==false/u);",
    "  assert.match(application,/const applicationAccess=state\\.applicationAccess\\|\\|\\{\\};/u);\n  assert.match(application,/const roleChoiceConfirmed=applicationAccess\\.roleChoiceConfirmed===true\\|\\|!canSwitchApplication\\(applicationAccess\\);/u);\n  assert.doesNotMatch(application,/const roleChoiceConfirmed=identity\\.roleChoiceConfirmed!==false/u);",
    "ONBOARDING_STALE_IDENTITY_CONTRACT_MISMATCH",
)

multirole = Path("tests/m26_rc39_integrated_client_coach_multirole.test.mjs")
replace_once(
    multirole,
    "  assert.match(application,/if\\(!canSwitchApplication\\(identity\\)\\|\\|!allowed\\.includes\\(role\\)\\)\\{/u);",
    "  assert.match(application,/const applicationAccess=store\\.getState\\(\\)\\.applicationAccess\\|\\|\\{\\};/u);\n  assert.match(application,/const allowed=Array\\.isArray\\(applicationAccess\\.authorizedRoles\\)\\?applicationAccess\\.authorizedRoles:\\[\\];/u);\n  assert.match(application,/if\\(!canSwitchApplication\\(applicationAccess\\)\\|\\|!allowed\\.includes\\(role\\)\\)\\{/u);\n  assert.doesNotMatch(application,/if\\(!canSwitchApplication\\(identity\\)\\|\\|!allowed\\.includes\\(role\\)\\)\\{/u);",
    "MULTIAPP_STALE_IDENTITY_AUTH_CONTRACT_MISMATCH",
)
