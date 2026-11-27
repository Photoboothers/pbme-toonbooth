// Printer set-up, in plain steps. The start file does the technical part for you.
export const kioskHelpHTML = `
<p>Do this once on the laptop that the printer is plugged into.</p>

<h3>Step 1 · Check the printer works on its own</h3>
<ol>
<li>Plug the printer into the laptop with its USB cable and switch it on (paper and ribbon loaded).</li>
<li>Click the Windows <b>Start</b> button and type <b>Printers</b>. Click <b>Printers &amp; scanners</b>.</li>
<li>Click your photo printer in the list, then click <b>Print test page</b>.</li>
</ol>
<p class="hint">If nothing prints here, the problem is the printer itself (cable, paper, ribbon or driver). Sort that out first: the booth cannot print until Windows can.</p>

<h3>Step 2 · Make it the main printer</h3>
<ol>
<li>On the same <b>Printers &amp; scanners</b> page, turn <b>off</b> "Let Windows manage my default printer" (near the bottom).</li>
<li>Click your photo printer, then click <b>Set as default</b>.</li>
<li>Click <b>Printing preferences</b> and choose paper size <b>4x6</b> (sometimes called 6x4 or PC 4x6). Choose borderless if you see it. Click OK.</li>
</ol>

<h3>Step 3 · Start the print station with the start file</h3>
<ol>
<li>Click the button below to download the start file.</li>
<li>Open your <b>Downloads</b> folder and double-click <b>Start-Print-Station</b>. (If Windows shows a blue warning, click <b>More info</b>, then <b>Run anyway</b>.)</li>
<li>Chrome closes and opens again on this page, ready to print without any pop-up window. Sign in if asked.</li>
<li>Click <b>Test print</b>. A 4x6 card should come out of the printer.</li>
</ol>
<p><button class="btn" id="dlStart">Download the start file</button></p>
<p class="hint">Keep the start file on the desktop and use it to open the print station at every event.</p>

<h3>If a print window still pops up</h3>
<p class="hint">Chrome was still open somewhere. Close every Chrome window, then double-click the start file again. The first time only, if the window appears anyway: pick your photo printer, paper size 4x6, margins None, scale 100%, and click Print. Chrome remembers this for next time.</p>`;

// a small Windows file that closes Chrome and reopens it on this print station with silent printing switched on
export function downloadStartFile() {
  const url = location.href.split('#')[0];
  const bat = ['@echo off', 'echo Starting the print station. Chrome will close and open again...', 'taskkill /IM chrome.exe /F >nul 2>&1', 'timeout /t 2 /nobreak >nul',
    `start "" chrome --kiosk-printing "${url}"`, 'exit'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bat], { type: 'application/octet-stream' })); a.download = 'Start-Print-Station.bat';
  document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 3000);
}
