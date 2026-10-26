# Troubleshooting

| Message or symptom | Fix |
|---|---|
| Add your Gemini key in Options | Enter a valid Gemini API key in Options and save it. No suggestion request is sent without a key. |
| API key invalid or restricted | Check the key in Options and ensure it is allowed to use the Generative Language API. |
| Reload the model list | In Options, press **Load models** and choose an available Fast and Strong model. |
| Rate limit | Wait for the displayed retry delay or retry manually after quota resets. |
| Couldn't read this page reliably | Export the page-structure report and use the calibration loop. Do not infer missing code or tests. |
| Expand Sample Test Cases | Expand the sample section yourself. The observer recaptures when it becomes visible. |
| Scroll editor to top | Scroll the editor until line 1 is visible; partial editor captures remain unverified. |
| Helper off / wrong token | Run `npm run helper:init`, paste its generated token into Options, start `npm run helper`, and press **Test helper**. |
| Port busy | Stop the other process or change the port in Options and restart the helper. Rebuild after changing the configured manifest port. |
| gcc missing | Install MSYS2 UCRT64 gcc, add `C:\msys64\ucrt64\bin` to PATH, open a new PowerShell window, and run `gcc --version`. |
| File I/O blocked | Inspect the proposal; use the explicit **Run anyway** action only if file access is part of the visible task. |
| Extension context invalidated | Reload the CodeTantra page after reloading or updating the extension. |
| First compile takes longer | Antivirus may scan each newly compiled temporary executable. |

The helper binds to `127.0.0.1`, checks the Host and secret token, rejects web Origins, and accepts only JSON requests up to 256 KB. Never expose its port to the network or share its token.
