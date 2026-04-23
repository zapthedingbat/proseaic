import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3001';
const MODEL = process.argv[2] || 'gemma4:e2b';
const CHAT_TIMEOUT = 120000;
const slug = MODEL.replace(/:/g, '-');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function log(msg) {
  console.log(`[test:${MODEL}] ${msg}`);
}

function ss(name) {
  return `screenshots/${slug}-${name}.png`;
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`  [browser:${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => console.log(`  [page error] ${err.message}`));

  try {
    log('Loading app...');
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    log('App loaded: ' + await page.title());
    await page.screenshot({ path: ss('01-initial') });

    // ── Select model ─────────────────────────────────────────────────────────
    log(`Selecting model: ${MODEL}`);
    const options = await page.$$eval('#chat-model-select option', opts =>
      opts.map(o => ({ value: o.value, text: o.textContent }))
    );
    log('Available models: ' + JSON.stringify(options));
    const target = options.find(o => o.value === MODEL || o.value.startsWith(MODEL));
    if (target) {
      await page.selectOption('#chat-model-select', target.value);
      log(`Selected: ${target.text}`);
    } else {
      log(`WARNING: model ${MODEL} not found, using default`);
    }

    // ── Create first document ────────────────────────────────────────────────
    log('\n--- Creating first document ---');
    await page.click('[title="New document"]');
    await sleep(800);

    log('Typing content in editor...');
    const editorPage = await page.$('#editor-page');
    if (editorPage) {
      await editorPage.click();
      await sleep(300);
      await page.keyboard.type('# My First Document\n\nThis is a test document for the Markdown AI Editor.\n\n## Goals\n\n- Test document creation\n- Test the AI chat feature\n- Verify everything works\n');
      await sleep(500);
      log('Content typed.');
    } else {
      log('Editor (#editor-page) not found');
    }

    await page.keyboard.press('Control+s');
    await sleep(500);
    await page.screenshot({ path: ss('02-first-doc') });

    // ── Chat: add a Summary section ───────────────────────────────────────────
    log('\n--- Chat: add Summary section ---');
    const chatTextarea = page.locator('#chat-textarea');
    await chatTextarea.click();
    await chatTextarea.fill('Please add a new section called "Summary" at the end of the document with a brief one-sentence summary of what this document is about.');
    await page.screenshot({ path: ss('03-chat-typed') });
    await page.click('#chat-send');

    log(`Waiting up to ${CHAT_TIMEOUT / 1000}s for the agent to finish...`);
    // Wait for the send button to become enabled again — that means the agent loop is done
    try {
      await page.waitForFunction(
        () => !document.querySelector('#chat-send')?.hasAttribute('disabled'),
        { timeout: CHAT_TIMEOUT }
      );
      log('Agent loop finished.');
    } catch {
      log('Timeout — agent did not finish within the limit.');
    }

    await sleep(1000);
    await page.screenshot({ path: ss('04-after-summary-chat') });

    const editorAfter1 = await page.evaluate(() => document.getElementById('editor-page')?.innerText ?? 'not found');
    log('Editor content after chat:\n' + editorAfter1);

    const chatMsgs1 = await page.$$eval('.chat-message', msgs =>
      msgs.map(m => ({ role: m.dataset.role, text: m.textContent?.trim().substring(0, 200) }))
    );
    log('Chat history:');
    for (const m of chatMsgs1) log(`  [${m.role}]: ${m.text}`);

    // ── Create second document ─────────────────────────────────────────────
    log('\n--- Creating second document ---');
    await page.click('[title="New document"]');
    await sleep(800);

    const editorPage2 = await page.$('#editor-page');
    if (editorPage2) {
      await editorPage2.click();
      await sleep(300);
      await page.keyboard.type('# Project Notes\n\nThese are notes for the project.\n\n## Tasks\n\n- [ ] Set up the environment\n- [ ] Write documentation\n- [ ] Deploy to production\n');
      await sleep(500);
    }
    await page.keyboard.press('Control+s');
    await sleep(500);
    await page.screenshot({ path: ss('05-second-doc') });

    // ── Chat: count tasks ─────────────────────────────────────────────────────
    log('\n--- Chat: count tasks ---');
    const prevCount = await page.$$eval('.chat-message[data-role="assistant"]', els => els.length);
    await chatTextarea.click();
    await chatTextarea.fill('Can you read the current document and tell me how many tasks are listed?');
    await page.click('#chat-send');

    log(`Waiting up to ${CHAT_TIMEOUT / 1000}s for the agent to finish...`);
    try {
      await page.waitForFunction(
        (prev) => document.querySelectorAll('.chat-message[data-role="assistant"]').length > prev,
        prevCount,
        { timeout: CHAT_TIMEOUT }
      );
      // Also wait for loop to fully complete
      await page.waitForFunction(
        () => !document.querySelector('#chat-send')?.hasAttribute('disabled'),
        { timeout: CHAT_TIMEOUT }
      );
      log('Agent loop finished.');
    } catch {
      log('Timeout — agent did not finish within the limit.');
    }

    await sleep(1000);
    await page.screenshot({ path: ss('06-after-tasks-chat') });

    const chatMsgs2 = await page.$$eval('.chat-message', msgs =>
      msgs.map(m => ({ role: m.dataset.role, text: m.textContent?.trim().substring(0, 200) }))
    );
    log('Final chat history:');
    for (const m of chatMsgs2) log(`  [${m.role}]: ${m.text}`);

    const docList = await page.$$eval('.list-item-title', items =>
      items.map(el => el.textContent?.trim())
    );
    log('\nDocuments in panel: ' + JSON.stringify(docList));

    log('\n=== Test complete ===');

  } catch (err) {
    console.error('\n[ERROR]', err.message);
    await page.screenshot({ path: ss('error') });
  } finally {
    await sleep(2000);
    await browser.close();
  }
})();
