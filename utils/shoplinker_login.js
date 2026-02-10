// shoplinker_login.js - Fixed Version
window.fillShoplinkerLogin = function(id, pw) {
    const idInput = document.querySelector("input[name='user_id']");
    const pwInput = document.querySelector("input[name='passwords']");
    const loginBtn = document.querySelector("button[type='submit'], input[type='submit']"); // ← 추가!

    if (idInput) idInput.value = id;
    if (pwInput) pwInput.value = pw;

    console.log("ID/PW 자동 입력 완료");

    if (typeof window.nemo_submit === "function") {
        console.log("🔐 자동 로그인: nemo_submit() 실행");
        window.nemo_submit();
    } else if (loginBtn) {
        console.log("🔐 자동 로그인: 로그인 버튼 클릭");
        loginBtn.click();
    } else {
        console.warn("⚠️ 로그인 submit을 찾지 못함");
    }
};