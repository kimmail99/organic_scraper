// info.js
// 샵링커 상품 정보를 가져오는 모듈

import fs from "fs";
import path from "path";

const IMAGE_BASE_URL = "https://ad2.shoplinker.co.kr";
const IMAGE_ROOT_DIR = path.resolve("./images");
const OUTPUT_CSV = path.resolve("./output.csv");

/* ============================================
   공통 유틸
============================================ */

// 파일/폴더명 안전화
function sanitizeName(name) {
    return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

// 상품명에서 품번 추출
function extractProductCode(productName) {
    if (!productName) return null;

    // 1️⃣ copy / 복사본 제거
    const cleaned = productName
        .replace(/[_-]copy.*$/i, "")   // _copy, -copy 이후 제거
        .replace(/\(copy.*?\)/i, "")   // (copy)
        .trim();

    // 2️⃣ 품번 추출 - 공백 앞의 대문자+숫자 조합 (최소 6자)
    // 예: "로고블루토들중말 DKF8SC03" → DKF8SC03
    const match = cleaned.match(/\b([A-Z0-9]{6,})\b/i);

    return match ? match[1] : null;
}

// 브라우저(context)에서 이미지 다운로드
async function downloadImageViaBrowser(pageOrFrame, imageUrl, savePath) {
    const byteArray = await pageOrFrame.evaluate(async (url) => {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("fetch failed: " + res.status);
        const buf = await res.arrayBuffer();
        return Array.from(new Uint8Array(buf));
    }, imageUrl);

    await fs.promises.writeFile(savePath, Buffer.from(byteArray));
}

// CSV 이스케이프
function csvEscape(value) {
    if (value === null || value === undefined) return "";
    return `"${String(value).replace(/"/g, '""')}"`;
}

// CSV 헤더 보장
function ensureCsvHeader() {
    if (!fs.existsSync(OUTPUT_CSV)) {
        const header = [
            "productCode",
            "productName",
            "size",
            "color",
            "mainImage",
            "additionalImages",
            "detailHtml",
            "tagHtml",
        ].join(",") + "\n";

        fs.writeFileSync(OUTPUT_CSV, header, "utf-8");
    }
}

// CSV 한 줄 추가
function appendToCsv(row) {
    ensureCsvHeader();
    fs.appendFileSync(OUTPUT_CSV, row + "\n", "utf-8");
}

/* ============================================
   상품 정보 추출 + 이미지 저장 + CSV 저장
============================================ */
export async function getProductInfo(pageOrFrame) {
    console.log("📦 상품 정보 추출 중...");

    /* ===== DOM 정보 수집 ===== */
    const productInfo = await pageOrFrame.evaluate(() => {
        const getValue = (selector) => {
            const el = document.querySelector(selector);
            return el ? el.value.trim() : null;
        };

        const getByNoun = (keywords) => {
            const list = Array.isArray(keywords) ? keywords : [keywords];

            const el = Array.from(document.querySelectorAll('input, textarea'))
                .find(el => {
                    const noun = el.getAttribute('noun') || "";
                    return list.some(k => noun.includes(k));
                });

            return el ? el.value.trim() : null;
        };


        const getAdditionalImages = () => {
            const images = [];
            for (let i = 6; i <= 18; i++) {
                const img = document.querySelector(`img[name="preview_images_image${i}"]`);
                if (img && img.src && !img.src.includes("noimg.gif")) {
                    images.push(
                        img.src.replace("https://ad2.shoplinker.co.kr", "")
                    );
                }
            }
            return images;
        };

        return {
            productName: getValue('input[name="product_name"]'),
            size: getByNoun(['치수', '크기', '크기, 중량', '중량', '사이즈']),
            color: getByNoun('색상'),
            images: {
                main: getValue('input[name="old_image_file"]'),
                additional: getAdditionalImages(),
            },
            detailHtml: getValue('textarea[name="detail_desc"]'),
            tagHtml: getValue('textarea[name="detail_desc_tag"]'),
        };
    });

    /* ===== 품번 ===== */
    const productCode = extractProductCode(productInfo.productName);
    if (!productCode) {
        console.warn("⚠️ 품번 추출 실패:", productInfo.productName);
    }

    /* ===== 콘솔 로그 ===== */
    console.log("✅ 품번:", productCode);
    console.log("✅ 상품명:", productInfo.productName);
    console.log("✅ 사이즈:", productInfo.size);
    console.log("✅ 색상:", productInfo.color);
    console.log("✅ 대표 이미지:", productInfo.images.main ? "있음" : "없음");
    console.log("✅ 부가 이미지:", productInfo.images.additional.length > 0 ? "있음" : "없음");
    console.log("✅ DETAIL HTML:", productInfo.detailHtml ? "있음" : "없음");
    console.log("✅ TAG HTML:", productInfo.tagHtml ? "있음" : "없음");

    /* ===== 이미지 저장 ===== */
    let mainImagePath = "";
    const additionalImagePaths = [];

    if (productCode) {
        const productDir = path.join(IMAGE_ROOT_DIR, sanitizeName(productCode));
        await fs.promises.mkdir(productDir, { recursive: true });

        // 대표 이미지
        if (productInfo.images.main) {
            const url = IMAGE_BASE_URL + productInfo.images.main;
            const ext = path.extname(url.split("?")[0]) || ".jpg";
            mainImagePath = path.join(productDir, `main${ext}`);

            try {
                await downloadImageViaBrowser(pageOrFrame, url, mainImagePath);
                console.log("🖼 대표 이미지 저장");
            } catch (e) {
                console.warn("⚠️ 대표 이미지 실패:", e.message);
            }
        }

        // 부가 이미지
        for (let i = 0; i < productInfo.images.additional.length; i++) {
            const rel = productInfo.images.additional[i];
            const url = IMAGE_BASE_URL + rel;
            const ext = path.extname(url.split("?")[0]) || ".jpg";
            const imgPath = path.join(productDir, `additional_${i + 1}${ext}`);

            try {
                await downloadImageViaBrowser(pageOrFrame, url, imgPath);
                additionalImagePaths.push(imgPath);
            } catch (e) {
                console.warn(`⚠️ 부가 이미지 ${i + 1} 실패`);
            }
        }
    }

    /* ===== CSV 저장 ===== */
    const csvRow = [
        csvEscape(productCode),
        csvEscape(productInfo.productName),
        csvEscape(productInfo.size),
        csvEscape(productInfo.color),
        csvEscape(mainImagePath),
        csvEscape(additionalImagePaths.join("|")),
        csvEscape(productInfo.detailHtml),
        csvEscape(productInfo.tagHtml),
    ].join(",");

    appendToCsv(csvRow);
    console.log("💾 output.csv 저장 완료");

    return productInfo;
}