export const kioskHelpHTML = `
<p class="hint">Kiosk printing makes Chrome print straight to the default printer with no print window. Do this once on the print-station laptop.</p>
<h3>1 · Make the DNP the default printer at 4×6</h3>
<ul>
<li><b>Windows:</b> Settings → Bluetooth &amp; devices → Printers &amp; scanners → turn OFF "Let Windows manage my default printer" → click the DNP (RX1 / QW410) → <b>Set as default</b>. Then Printing preferences → paper size <b>(6x4) / PC 4x6</b>, borderless on.</li>
<li><b>Mac:</b> System Settings → Printers &amp; Scanners → Default printer: the DNP. Default paper size: 4x6 (PC 4x6).</li>
</ul>
<h3>2 · Start Chrome with kiosk printing</h3>
<ul>
<li><b>Windows:</b> close ALL Chrome windows (also check the Chrome icon near the clock and quit it). Right-click the Chrome shortcut → Properties → in <b>Target</b>, after the closing quote add a space and <code>--kiosk-printing</code>. Example:<br><code>"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing</code><br>Click OK, then open Chrome with that shortcut.</li>
<li><b>Mac:</b> quit Chrome completely (Chrome → Quit). Open the Terminal app and paste:<br><code>open -a "Google Chrome" --args --kiosk-printing</code></li>
</ul>
<h3>3 · First test print</h3>
<p class="hint">Open the print station and click <b>Test print</b>. If a print window still appears, Chrome was not fully closed in step 2. The first time, if Chrome uses the wrong paper size, print once normally with: Destination = DNP, Paper size = 4x6, Margins = None, Scale = 100% (Chrome remembers these).</p>`;
