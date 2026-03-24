import { chromium, firefox, webkit, Browser, Page } from "playwright";
import { writeFile } from "fs/promises";

type BrowserType = 'chromium' | 'firefox' | 'webkit';
type BrowserStatus = 'passed' | 'failed';

type BrowserResult = {
  browser: BrowserType;
  status: BrowserStatus;
  message: string;
  durationMs: number;
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function loadPage(url: string, browserType: BrowserType): Promise<BrowserResult> {
  let browser: Browser | null = null;
  const start = Date.now();

  try {
    switch (browserType) {
      case 'chromium':
        browser = await chromium.launch({ headless: false, args: ["--start-maximized"] });
        break;
      case 'firefox':
        browser = await firefox.launch({ headless: false, args: ["--start-maximized"] });
        break;
      case 'webkit':
        browser = await webkit.launch({ headless: false, args: ["--start-maximized"] });
        break;
      default:
        throw new Error(`Unsupported browser: ${browserType}`);
    }
    const page: Page = await browser.newPage({
      viewport: null, // disables fixed viewport so it uses the full window size
    });

    console.log(`Navigating to: ${url} in ${browserType}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });

    const title = await page.title();
    console.log(`Page title in ${browserType}: ${title}`);

    await page.waitForTimeout(5000); // wait 5 seconds
    await page.locator('[data-path="/api/v1/industries"]').click();
    await page.waitForTimeout(2000); // wait 2 seconds
    await page.locator('.btn.execute.opblock-control__btn').click();   
    await page.waitForTimeout(5000); // wait 5 seconds

    const browserDuration = Date.now() - start;

    return {
      browser: browserType,
      status: 'passed',
      message: `Loaded successfully; title: ${title}`,
      durationMs: browserDuration,
    };
  } catch (error: any) {
    console.error(`Error loading page in ${browserType}:`, error);
    return {
      browser: browserType,
      status: 'failed',
      message: String(error),
      durationMs: Date.now() - start,
    };
  } finally {await browser?.close();
  }
}

async function writeReport(url: string, results: BrowserResult[], elapsedMs: number): Promise<void> {
  const timestamp = new Date().toISOString();
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const elapsed = formatDuration(elapsedMs);

  const rows = results.map(r => `
      <tr>
        <td>${r.browser}</td>
        <td>${r.status}</td>
        <td>${r.message}</td>
        <td>${formatDuration(r.durationMs)}</td>
      </tr>
    `).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SaaS PPS Browser Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f4f4f4; }
    .passed { color: green; font-weight: bold; }
    .failed { color: red; font-weight: bold; }
    .download-btn {
      background-color: #4a50a1;
      color: white;
      padding: 10px 20px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      margin-bottom: 20px;
    }
    .download-btn:hover {
      background-color: #4a50a1;
    }
  </style>
</head>
<body>
  <h1>SaaS PPS Browser Test Report</h1>
  <p><strong>URL:</strong> ${url}</p>
  <p><strong>Timestamp:</strong> ${timestamp}</p>
  <p><strong>Total time:</strong> ${elapsed} seconds</p>
  <p><strong>Passed:</strong> ${passed}, <strong>Failed:</strong> ${failed}</p>
  <button class="download-btn" onclick="downloadReportAsCSV()">📥 Download Report (CSV)</button>
  <table>
    <thead>
      <tr>
        <th>Browser</th>
        <th>Status</th>
        <th>Message</th>
        <th>Duration</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <script>
    function downloadReportAsCSV() {
      const table = document.querySelector('table');
      const rows = table.querySelectorAll('tr');
      const csvContent = [];
      
      // Extract metadata from page content
      const pageText = document.body.innerText;
      const urlMatch = pageText.match(/URL:\\s*(.+)/);
      const timestampMatch = pageText.match(/Timestamp:\\s*(.+)/);
      const timeMatch = pageText.match(/Total time:\\s*(.+)/);
      const passFailMatch = pageText.match(/Passed:\\s*(.+)/);
      
      const url = urlMatch ? urlMatch[1].trim() : '';
      const timestamp = timestampMatch ? timestampMatch[1].trim() : '';
      const totalTime = timeMatch ? timeMatch[1].trim() : '';
      const passFailStr = passFailMatch ? passFailMatch[1].trim() : '';
      
      // Add metadata to CSV
      csvContent.push('Playwright Browser Test Report');
      csvContent.push('');
      csvContent.push('URL: ' + url);
      csvContent.push('Timestamp: ' + timestamp);
      csvContent.push('Total time: ' + totalTime);
      csvContent.push('Passed/Failed: ' + passFailStr);
      csvContent.push('');
      csvContent.push('');
      
      // Add table headers
      const headerRow = [];
      const headerCells = rows[0].querySelectorAll('th');
      headerCells.forEach(cell => {
        headerRow.push('"' + cell.textContent.trim() + '"');
      });
      csvContent.push(headerRow.join(','));
      
      // Add table data rows
      for (let i = 1; i < rows.length; i++) {
        const rowData = [];
        const cells = rows[i].querySelectorAll('td');
        cells.forEach(cell => {
          rowData.push('"' + cell.textContent.trim() + '"');
        });
        csvContent.push(rowData.join(','));
      }
      
      // Create blob and download
      const csvString = csvContent.join('\\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      
      // Generate filename with current timestamp
      const now = new Date();
      const filename = 'SaaS-PPS-Browser-Test-Report-' + now.getFullYear() + '-' + 
                      String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                      String(now.getDate()).padStart(2, '0') + '.csv';
      
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  </script>
</body>
</html>`;

  await writeFile('test-report.html', html, 'utf-8');
  console.log('Report written to test-report.html');

  await openReport('test-report.html');
}

async function openReport(filePath: string): Promise<void> {
  const { exec } = await import('child_process');
  const platform = process.platform;

  let command: string;
  if (platform === 'win32') {
    command = `start "" "${filePath}"`;
  } else if (platform === 'darwin') {
    command = `open "${filePath}"`;
  } else {
    command = `xdg-open "${filePath}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.error('Could not open report automatically:', error);
    } else {
      console.log('Report opened automatically in default browser.');
    }
  });
}

const url = "https://saasppsgateway.eglobeitsolutions.org/docs/swagger";
const browsers: BrowserType[] = ['chromium', 'firefox', 'webkit'];

(async () => {
  const results: BrowserResult[] = [];
  const start = Date.now();

  for (const browser of browsers) {
    const r = await loadPage(url, browser);
    results.push(r);
  }

  const elapsed = Date.now() - start;
  await writeReport(url, results, elapsed);
})();
