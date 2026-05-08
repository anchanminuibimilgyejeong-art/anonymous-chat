const adminForm = document.querySelector("#adminForm");
const adminPassword = document.querySelector("#adminPassword");
const adminActions = document.querySelector("#adminActions");
const clearButton = document.querySelector("#clearButton");
const adminStatus = document.querySelector("#adminStatus");

let adminSecret = "";

function setAdminStatus(text, bad = false) {
  adminStatus.textContent = text;
  adminStatus.classList.toggle("bad", bad);
}

adminForm.addEventListener("submit", (event) => {
  event.preventDefault();
  adminSecret = adminPassword.value.trim();
  if (!adminSecret) return;
  adminForm.hidden = true;
  adminActions.hidden = false;
  setAdminStatus("관리자 모드");
});

clearButton.addEventListener("click", async () => {
  if (!adminSecret) return;
  if (!window.confirm("모든 메시지를 초기화할까요?")) return;

  clearButton.disabled = true;
  try {
    const response = await fetch("/admin/clear", {
      method: "POST",
      headers: { "X-Admin-Secret": adminSecret }
    });
    if (!response.ok) {
      setAdminStatus("비밀번호가 맞지 않습니다.", true);
      adminForm.hidden = false;
      adminActions.hidden = true;
      adminSecret = "";
      adminPassword.value = "";
      adminPassword.focus();
      return;
    }
    setAdminStatus("메시지를 초기화했습니다.");
  } catch {
    setAdminStatus("초기화에 실패했습니다.", true);
  } finally {
    clearButton.disabled = false;
  }
});

adminPassword.focus();
