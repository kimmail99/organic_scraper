/**
 * coupang.js
 * CSV → Coupang Seller Product Create
 */

import fs from "fs";
import crypto from "crypto";
import axios from "axios";
import csv from "csv-parser";

/* ===============================
   🔐 쿠팡 인증 정보
=============================== */
const ACCESS_KEY = process.env.COUPANG_ACCESS_KEY;
const SECRET_KEY = process.env.COUPANG_SECRET_KEY;
const VENDOR_ID = process.env.VENDOR_ID;                // Wing 벤더 ID   
const VENDOR_USER_ID = process.env.VENDOR_USER_ID;      // Wing 로그인 ID

/* ===============================
   📦 고정 정보 (1차는 하드코딩 권장)
=============================== */
const DISPLAY_CATEGORY_CODE = 123456;  // 카테고리 추천 API로 얻은 값
const OUTBOUND_CODE = "74010";
const RETURN_CENTER_CODE = "1000000000";

/* ===============================
   🌐 쿠팡 API 기본
=============================== */
const BASE_URL = "https://api-gateway.coupang.com";
const CREATE_PRODUCT_PATH =
  "/v2/providers/seller_api/apis/api/v1/marketplace/seller-products";

/* ===============================
   🔑 HMAC 인증 헤더 생성
=============================== */
function createAuthorization(method, path, query = "") {
  const datetime = new Date()
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "");

  const message = datetime + method + path + query;
  const signature = crypto
    .createHmac("sha256", SECRET_KEY)
    .update(message)
    .digest("hex");

  return `CEA algorithm=HmacSHA256, access-key=${ACCESS_KEY}, signed-date=${datetime}, signature=${signature}`;
}

/* ===============================
   🧹 HTML 정리 (쿠팡 필수)
=============================== */
function cleanHtml(html) {
  if (!html) return "";
  return html
    .replace(/\n/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ===============================
   🖼️ 이미지 경로 → URL 변환
   (❗ 여긴 네 CDN/S3에 맞게 수정)
=============================== */
function localPathToUrl(localPath) {
  const filename = localPath.split("/").pop();
  return `https://cdn.yoursite.com/${filename}`;
}

/* ===============================
   📄 CSV → 상품 JSON 변환
=============================== */
function buildProduct(row) {
  const additionalImages = row.additionalImages
    .split("|")
    .map((p, i) => ({
      imageOrder: i + 1,
      imageType: "DETAIL",
      vendorPath: localPathToUrl(p),
    }));

  const mergedHtml =
    cleanHtml(row.detailHtml) + cleanHtml(row.tagHtml);

  return {
    displayCategoryCode: DISPLAY_CATEGORY_CODE,
    sellerProductName: row.productName,
    displayProductName: row.productName,
    vendorId: VENDOR_ID,
    vendorUserId: VENDOR_USER_ID,

    saleStartedAt: "2025-01-01T00:00:00",
    saleEndedAt: "2099-12-31T23:59:59",

    brand: "브랜드명",
    generalProductName: row.productName,
    productGroup: "아동신발",

    deliveryMethod: "SEQUENCIAL",
    deliveryCompanyCode: "CJGLS",
    deliveryChargeType: "FREE",
    deliveryCharge: 0,
    deliveryChargeOnReturn: 3000,

    outboundShippingPlaceCode: OUTBOUND_CODE,
    returnCenterCode: RETURN_CENTER_CODE,
    returnCharge: 3000,
    returnChargeVendor: "N",

    afterServiceInformation: "A/S 문의는 고객센터",
    afterServiceContactNumber: "010-0000-0000",

    items: [
      {
        itemName: `${row.size}/${row.color}`,
        originalPrice: 59000,
        salePrice: 39000,
        maximumBuyCount: "100",
        outboundShippingTimeDay: "1",
        taxType: "TAX",
        adultOnly: "EVERYONE",
        externalVendorSku: row.productCode,
      },
    ],

    attributes: [
      {
        attributeTypeName: "사이즈",
        attributeValueName: row.size,
      },
      {
        attributeTypeName: "색상",
        attributeValueName: row.color,
      },
    ],

    images: [
      {
        imageOrder: 0,
        imageType: "REPRESENTATION",
        vendorPath: localPathToUrl(row.mainImage),
      },
      ...additionalImages,
    ],

    contents: [
      {
        contentsType: "TEXT",
        contentDetails: [
          {
            content: mergedHtml,
            detailType: "TEXT",
          },
        ],
      },
    ],

    notices: [
      {
        noticeCategoryName: "기타 재화",
        noticeCategoryDetailName: "품명 및 모델명",
        content: row.productName,
      },
      {
        noticeCategoryName: "기타 재화",
        noticeCategoryDetailName: "제조국(원산지)",
        content: "중국",
      },
      {
        noticeCategoryName: "기타 재화",
        noticeCategoryDetailName: "제조자(수입자)",
        content: "상세페이지 참조",
      },
    ],

    requested: true,
  };
}

/* ===============================
   🚀 상품 업로드
=============================== */
async function uploadProduct(product) {
  const auth = createAuthorization(
    "POST",
    CREATE_PRODUCT_PATH
  );

  return axios.post(BASE_URL + CREATE_PRODUCT_PATH, product, {
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
  });
}

/* ===============================
   ▶ 실행
=============================== */
async function run() {
  const rows = [];

  fs.createReadStream("./output.csv")
    .pipe(csv())
    .on("data", (row) => rows.push(row))
    .on("end", async () => {
      for (const row of rows) {
        try {
          const product = buildProduct(row);
          const res = await uploadProduct(product);
          console.log("✅ 등록 성공:", res.data);
        } catch (err) {
          console.error(
            "❌ 등록 실패:",
            err.response?.data || err.message
          );
        }
      }
    });
}

run();
