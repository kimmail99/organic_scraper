// utils/판매방식_선택.js

/**
 * 판매방식 선택 - 판매자배송 체크박스 클릭
 * @param {import('puppeteer').Page} page
 */
export async function 판매방식_선택(page) {
    console.log("📦 판매방식 선택 중...");

    // "판매자배송" 텍스트가 있는 label의 체크박스 클릭
    await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll("label span"));
        const target = labels.find(span => span.textContent.trim() === "판매자배송");

        if (!target) throw new Error("판매자배송 체크박스를 찾을 수 없음");

        const label = target.closest("label");
        const checkbox = label.parentElement.querySelector('input[type="checkbox"]');

        if (checkbox && checkbox.checked) {
            console.log("이미 선택되어 있음, 스킵");
            return;
        }

        label.click();
    });

    await new Promise(r => setTimeout(r, 1000));
    console.log("✅ 판매방식 선택 완료 (판매자배송)");
}