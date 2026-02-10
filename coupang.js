// coupang.js - Ubuntu Server Version
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

import { 판매방식_선택 } from "./utils/판매방식_선택.js";

/* ============================================
   CSV 읽기
============================================ */
function readProductsFromCSV(filePath) {
    const raw = fs.readFileSync(filePath, "utf-8");
    
    // CSV 파싱: 줄바꿈이 큰따옴표 안에 있을 수 있으므로 행 단위로 분리
    const rows = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < raw.length; i++) {
        const char = raw[i];
        if (char === '"') {
            // 이중 큰따옴표("") → 리터럴 큰따옴표
            if (raw[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (current.trim()) rows.push(current);
            current = "";
            // \r\n 처리
            if (char === '\r' && raw[i + 1] === '\n') i++;
        } else {
            current += char;
        }
    }
    if (current.trim()) rows.push(current);

    const headers = parseCSVLine(rows[0]);
    return rows.slice(1).map(row => {
        const values = parseCSVLine(row);
        const obj = {};
        headers.forEach((h, i) => {
            obj[h] = values[i] || "";
        });
        return obj;
    });
}

function parseCSVLine(line) {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    values.push(current);
    return values;
}

/* ============================================
   MAIN
============================================ */
async function main() {
    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: "/usr/bin/chromium-browser",
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
        ],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(15000);

    // 봇 감지 우회
    await page.setUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "ko-KR,ko;q=0.9" });
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    /* ===== 쿠팡 wing 접속 ===== */
    console.log("🌐 쿠팡 wing 접속 중...");
    await page.goto("https://wing.coupang.com/", { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 2000));

    /* ===== 로그인 ===== */
    console.log("🔐 로그인 중...");
    await page.waitForSelector("#username", { timeout: 15000 });
    await page.type("#username", process.env.COUPANG_ID, { delay: 50 });
    await page.type("#password", process.env.COUPANG_PW, { delay: 50 });
    await page.click("#kc-login");
    await new Promise(r => setTimeout(r, 5000));

    console.log("✅ 로그인 완료! 현재 URL:", page.url());

    /* ===== 상품등록 메뉴 클릭 ===== */
    console.log("📋 상품등록 메뉴 이동 중...");
    await page.evaluate(() => {
        document
            .querySelector('li[data-menu-code="PRODUCT_RENEWAL"] a.top-level-node-label')
            ?.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => {
        document
            .querySelector('li[data-menu-code="1X1_LISTING"] a')
            ?.click();
    });
    await new Promise(r => setTimeout(r, 5000));

    console.log("현재 URL:", page.url());
    await page.screenshot({ path: "debug_product_register.png", fullPage: true });
    console.log("📸 debug_product_register.png 저장됨");

    /* ===== CSV 읽기 ===== */
    const products = readProductsFromCSV("./output.csv");
    console.log(`📦 총 상품 수: ${products.length}`);

    for (const product of products) {
        console.log(`\n🔁 처리 시작: ${product.productCode} - ${product.productName}`);

         // 1. 판매방식 선택
        await 판매방식_선택(page);

        await page.screenshot({ path: "debug_판매방식.png", fullPage: true });
        console.log("📸 debug_판매방식.png 저장됨");

        // TODO: 다음 단계 추가
        break; // 디버깅용: 첫 상품만 처리
    }

    console.log("\n✅ 모든 상품 처리 완료");
    await browser.close();
}

/* ============================================
   RUN
============================================ */
(async () => {
    try {
        await main();
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    }
})();