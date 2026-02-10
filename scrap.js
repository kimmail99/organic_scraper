// upload.js - Ubuntu Server Version
import puppeteer from "puppeteer";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

import { getProductInfo } from "./utils/info.js";

/* ============================================
   CSV 읽기 (A열, 3번째 행부터)
============================================ */
function readProductCodesFromCSV(filePath) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const lines = raw.split(/\r?\n/);

    return lines
        .slice(2)
        .map(line => line.split(",")[0]?.trim())
        .filter(Boolean);
}

/* ============================================
   MAIN
============================================ */
async function main() {
    // Headless Chrome 실행
    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: '/usr/bin/chromium-browser',  
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-features=ChromeWhatsNewUI'
        ]
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(15000); // 전역 navigation timeout 설정

    await page.goto("https://www.google.com");
    await new Promise(r => setTimeout(r, 2000));

    await page.goto("https://ad2.shoplinker.co.kr/index.php");
    await new Promise(r => setTimeout(r, 3000));

    /* ===== 로그인 ===== */
    await page.addScriptTag({ path: "./utils/shoplinker_login.js" });
    await page.evaluate(
        (id, pw) => window.fillShoplinkerLogin(id, pw),
        process.env.SHOP_LINKER_ID,
        process.env.SHOP_LINKER_PW
    );

    await new Promise(r => setTimeout(r, 3000));

    /* ===== mainFrame ===== */
    const mainFrame = page.frames().find(f =>
        f.url().includes("/admin/main") &&
        !f.url().includes("/left") &&
        !f.url().includes("/top")
    );
    if (!mainFrame) throw new Error("mainFrame 없음");

    /* ===== 상품조회/수정 메뉴 ===== */
    await mainFrame.evaluate(() => {
        document.querySelector("#SL_MENU")
            ?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        document.querySelector("a.m_007")
            ?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        document
            .querySelector('a[href="/admin/product/product_list"]')
            ?.click();
    });

    await new Promise(r => setTimeout(r, 3000));

    /* ===== CSV 읽기 ===== */
    const productCodes = readProductCodesFromCSV("./input.csv");
    console.log(`📦 총 품번 수: ${productCodes.length}`);

    /* ===== 품번 루프 ===== */
    for (const code of productCodes) {
        console.log(`\n🔁 처리 시작: ${code}`);

        try {
            // 항상 최신 product_list frame 다시 찾기
            let productFrame;
            for (let i = 0; i < 20; i++) {
                productFrame = page.frames().find(f =>
                    f.url().includes("/admin/product/product_list")
                );
                if (productFrame) break;
                await new Promise(r => setTimeout(r, 500));
            }
            if (!productFrame) throw new Error("product_list frame 없음");

            // 검색
            await new Promise(r => setTimeout(r, 5000));
            await productFrame.evaluate(code => {
                const stDate = document.querySelector("#st_date");
                const searchArea = document.querySelector("textarea[name='search_str']");
                const submitBtn = document.querySelector("#submitBtn");

                if (!stDate || !searchArea || !submitBtn) {
                    throw new Error("검색 DOM 없음");
                }

                stDate.value = "2005-01-01";
                stDate.dispatchEvent(new Event("input", { bubbles: true }));
                stDate.dispatchEvent(new Event("change", { bubbles: true }));

                searchArea.focus();
                searchArea.value = "";
                searchArea.value = code;
                searchArea.dispatchEvent(new Event("input", { bubbles: true }));
                searchArea.dispatchEvent(new Event("change", { bubbles: true }));

                submitBtn.click();
            }, code);

            await new Promise(r => setTimeout(r, 3000));

            // 복사 클릭
            await productFrame.evaluate((code) => {
                const rows = Array.from(document.querySelectorAll("tbody tr"));
            
                for (const row of rows) {
                    const span = row.querySelector("span[style*='color']");
            
                    if (!span) continue;
            
                    const text = span.innerText.trim();
            
                    // 품번이 포함된 행인지 확인
                    if (text.includes(code)) {
                        const copyBtn = row.querySelector('a[href*="mode=copy"]');
            
                        if (!copyBtn) {
                            throw new Error(`복사 버튼 없음 (품번: ${code})`);
                        }
            
                        copyBtn.click();
                        return;
                    }
                }
            
                throw new Error(`해당 품번 행을 찾지 못함: ${code}`);
            }, code);

            await new Promise(r => setTimeout(r, 3000));

            // 상세 페이지 frame
            const detailFrame = page.frames().find(f =>
                f.url().includes("product_insert") ||
                f.url().includes("mode=copy")
            );
            if (!detailFrame) throw new Error("상세 페이지 frame 없음");

            await new Promise(r => setTimeout(r, 2000));

            // 정보 처리 (저장은 info.js에서)
            await getProductInfo(detailFrame);
            console.log(`✅ 완료: ${code}`);

            // 🔙 목록으로 복귀 중... - 직접 이동 방식
            console.log(`🔙 목록으로 복귀 중...`);
            await page.goto('https://ad2.shoplinker.co.kr/admin/product/product_list', {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });
            await new Promise(r => setTimeout(r, 3000));

        } catch (err) {
            console.error(`❌ 실패: ${code}`, err.message);
            
            // 에러 발생 시에도 목록으로 복귀 시도
            try {
                console.log(`🔙 에러 후 목록 복귀 시도...`);
                await page.goto('https://ad2.shoplinker.co.kr/admin/product/product_list', {
                    waitUntil: 'domcontentloaded',
                    timeout: 15000
                });
                await new Promise(r => setTimeout(r, 3000));
            } catch (recoverErr) {
                console.warn(`⚠️ 복구 실패:`, recoverErr.message);
            }
        }
    }

    console.log("\n✅ 모든 품번 처리 완료");
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