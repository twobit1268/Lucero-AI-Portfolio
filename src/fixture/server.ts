import { createServer } from "node:http";

/**
 * Minimal local app under test. Two DOM "versions" simulate a UI refactor:
 * v1 is what the authoring agent originally sees; v2 renames the login
 * button's id/class (a realistic drift) so the self-healing demo has
 * something real to recover from, with no external site dependency.
 */
const UI_VERSION = process.env.UI_VERSION === "2" ? 2 : 1;
const PORT = Number(process.env.PORT ?? 4173);

function loginButtonMarkup(): string {
  // v2 changes both the id/class AND the visible label ("Log In" -> "Sign In")
  // — a realistic rebrand/refactor that breaks a role+name locator too, not
  // just a brittle CSS-id locator, so the self-healing demo has something
  // genuine to recover from rather than a change that wouldn't have broken
  // a well-written test in the first place.
  return UI_VERSION === 1
    ? `<button id="login-btn" class="btn-primary">Log In</button>`
    : `<button id="submit-button" class="cta cta--primary">Sign In</button>`;
}

function page(): string {
  return `<!doctype html>
<html>
<head><title>TestPilot Fixture App — Login</title></head>
<body>
  <h1>Sign in</h1>
  <form id="login-form">
    <label for="username">Username</label>
    <input id="username" name="username" type="text" />
    <label for="password">Password</label>
    <input id="password" name="password" type="password" />
    ${loginButtonMarkup()}
  </form>
  <div id="welcome-message" style="display:none">Welcome back, <span id="welcome-name"></span>!</div>
  <div id="error-message" style="display:none">Invalid username or password.</div>
  <script>
    document.getElementById('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var u = document.getElementById('username').value;
      var p = document.getElementById('password').value;
      var welcome = document.getElementById('welcome-message');
      var error = document.getElementById('error-message');
      if (u === 'demo' && p === 'password123') {
        document.getElementById('welcome-name').textContent = u;
        welcome.style.display = 'block';
        error.style.display = 'none';
      } else {
        error.style.display = 'block';
        welcome.style.display = 'none';
      }
    });
  </script>
</body>
</html>`;
}

createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(page());
}).listen(PORT, () => {
  console.log(`[fixture] serving UI_VERSION=${UI_VERSION} on http://localhost:${PORT}`);
});
