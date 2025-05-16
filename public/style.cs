/* public/style.css */

/* :root визначає змінні для світлої теми (за замовчуванням) */
:root {
  --body-bg: #eef1f5;
  --text-color: #2c3e50; /* Основний темний текст для світлої теми */
  --text-muted-color: #6c757d;
  --link-color: #007bff;
  --link-hover-color: #0056b3;

  --card-bg: #ffffff;
  --card-header-bg: #f8f9fc;
  --card-header-color: #212529;
  --card-footer-bg: #f8f9fc;
  --card-border-color: rgba(0, 0, 0, 0.125);

  --navbar-bg: #343a40;
  --navbar-color: rgba(255, 255, 255, 0.8);
  --navbar-brand-color: #ffffff;
  --nav-link-hover-bg: rgba(255, 255, 255, 0.1);
  --nav-link-active-color: #ffffff;

  --footer-bg: #2c3e50;
  --footer-color: rgba(255, 255, 255, 0.8);
  --footer-link-color: rgba(255, 255, 255, 0.9);
  --footer-link-hover-color: #1abc9c;

  --btn-primary-bg: #007bff;
  --btn-primary-border: #007bff;
  --btn-primary-text: #ffffff;
  --btn-primary-hover-bg: #0069d9;
  --btn-primary-hover-border: #0062cc;

  --btn-outline-secondary-color: #6c757d;
  --btn-outline-secondary-border: #6c757d;
  --btn-outline-secondary-hover-color: #fff;
  --btn-outline-secondary-hover-bg: #6c757d;
  --btn-outline-secondary-hover-border: #6c757d;

  --code-bg: #e9ecef;
  --code-text-color: #c7254e;

  --code-textarea-bg: #263238;
  --code-textarea-color: #eeffff;
  --code-textarea-border: #455a64;

  --log-output-bg: #1e1e1e;
  --log-output-color: #d4d4d4;

  --alert-danger-bg: #f8d7da;
  --alert-danger-color: #721c24;
  --alert-danger-border: #f5c2c7;
  --alert-success-bg: #d4edda;
  --alert-success-color: #155724;
  --alert-success-border: #c3e6cb;
  --alert-info-bg: #d1ecf1;
  --alert-info-color: #0c5460;
  --alert-info-border: #bee5eb;
  --alert-warning-bg: #fff3cd;
  --alert-warning-color: #856404;
  --alert-warning-border: #ffeeba;

  --input-bg: #ffffff;
  --input-color: #212529; /* Колір тексту в активних полях */
  --input-border-color: #ced4da;
  --input-disabled-bg: #e9ecef;
  --input-disabled-color: #495057; /* Темніший сірий для тексту в неактивних полях */
  --input-disabled-border-color: #ced4da;
  --input-focus-border-color: #86b7fe;
  --input-focus-box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);

  --nav-tabs-border-color: #dee2e6;
  --nav-tabs-link-color: #495057;
  --nav-tabs-link-hover-border-color: #e9ecef #e9ecef var(--body-bg);
  --nav-tabs-link-hover-color: var(--link-hover-color);
  --nav-tabs-link-active-color: var(--link-color);
  --nav-tabs-link-active-bg: var(
    --card-bg
  ); /* Фон активної вкладки як фон картки */
  --nav-tabs-link-active-border-color: var(--nav-tabs-border-color)
    var(--nav-tabs-border-color) var(--nav-tabs-link-active-bg);

  --pre-bg: #f8f9fa; /* Фон для <pre> у світлій темі */
  --pre-text-color: var(--text-color);
  --pre-border-color: var(--card-border-color);
}

/* --- Темна тема --- */
html.dark-theme-preload :root {
  --body-bg: #121212;
  --text-color: #e4e6eb;
}
body.dark-theme {
  --body-bg: #121212;
  --text-color: #e4e6eb; /* ОСНОВНИЙ СВІТЛИЙ ТЕКСТ ДЛЯ ТЕМНОЇ ТЕМИ */
  --text-muted-color: #a8b3cf;
  --link-color: #79c0ff;
  --link-hover-color: #a1d1ff;

  --card-bg: #1e1e1e;
  --card-header-bg: #2a2a2a;
  --card-header-color: #f0f2f5;
  --card-footer-bg: #2a2a2a;
  --card-border-color: #3a3b3c;

  --navbar-bg: #1c1c1c;
  --navbar-color: rgba(255, 255, 255, 0.8); /* Яскравіше */
  --navbar-brand-color: #ffffff;
  --nav-link-hover-bg: rgba(255, 255, 255, 0.1);
  --nav-link-active-color: #ffffff;

  --footer-bg: #1c1c1c;
  --footer-color: rgba(255, 255, 255, 0.8); /* Яскравіше */
  --footer-link-color: rgba(255, 255, 255, 0.9);
  --footer-link-hover-color: #20c997;

  --btn-primary-bg: #2579fc;
  --btn-primary-border: #2579fc;
  --btn-primary-text: #ffffff;
  --btn-primary-hover-bg: #1a6ef2;
  --btn-primary-hover-border: #1862e0;

  --btn-outline-secondary-color: #adb5bd;
  --btn-outline-secondary-border: #555a60;
  --btn-outline-secondary-hover-color: #121212;
  --btn-outline-secondary-hover-bg: #adb5bd;
  --btn-outline-secondary-hover-border: #adb5bd;

  --code-bg: #2a2a2a;
  --code-text-color: #d1d5db;

  --alert-danger-bg: #422024;
  --alert-danger-color: #f5c6cb;
  --alert-danger-border: #5c2e36;
  --alert-success-bg: #153220;
  --alert-success-color: #c3e6cb;
  --alert-success-border: #1f4a2f;
  --alert-info-bg: #0c3c4c;
  --alert-info-color: #bee5eb;
  --alert-info-border: #11526b;
  --alert-warning-bg: #4d3803;
  --alert-warning-color: #ffeeba;
  --alert-warning-border: #664d03;

  --input-bg: #2a2a2a;
  --input-color: #e4e6eb;
  --input-border-color: #44474a;
  --input-disabled-bg: #313437; /* Темний фон для неактивних полів */
  --input-disabled-color: #9098a1; /* Світліший сірий текст для неактивних */
  --input-disabled-border-color: #44474a;
  --input-focus-border-color: #2579fc;
  --input-focus-box-shadow: 0 0 0 0.25rem rgba(37, 121, 252, 0.4);

  --nav-tabs-border-color: #3a3b3c;
  --nav-tabs-link-color: #a8b3cf;
  --nav-tabs-link-hover-border-color: #44474a #44474a var(--body-bg);
  --nav-tabs-link-hover-color: var(--link-hover-color);
  --nav-tabs-link-active-color: var(--link-color);
  --nav-tabs-link-active-bg: var(--body-bg);
  --nav-tabs-link-active-border-color: var(--nav-tabs-border-color)
    var(--nav-tabs-border-color) var(--nav-tabs-link-active-bg);

  --pre-bg: #2a2a2a; /* Фон для <pre> у темній темі */
  --pre-text-color: var(--text-color); /* Основний світлий текст */
  --pre-border-color: var(--card-border-color);
}

/* --- Базові стилі --- */
body {
  padding-top: 70px;
  padding-bottom: 80px;
  background-color: var(--body-bg);
  color: var(--text-color); /* ЗАСТОСОВУЄМО ОСНОВНИЙ КОЛІР ТЕКСТУ */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow-x: hidden;
  transition: background-color 0.2s ease-in-out, color 0.2s ease-in-out;
}

a {
  color: var(--link-color);
  text-decoration: none;
}
a:hover {
  color: var(--link-hover-color);
  text-decoration: underline;
}
h1,
h2,
h3,
h4,
h5,
h6 {
  color: var(
    --text-color
  ); /* Переконуємось, що заголовки теж використовують змінну */
}

/* --- Навігаційна панель --- */
.navbar {
  background-color: var(--navbar-bg) !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: background-color 0.2s ease-in-out;
}
.navbar-brand {
  color: var(--navbar-brand-color) !important;
  font-weight: 600;
  font-size: 1.3rem;
}
.nav-link {
  color: var(--navbar-color) !important;
  transition: color 0.2s ease-in-out, transform 0.15s ease-in-out,
    background-color 0.15s ease-in-out;
  padding: 0.75rem 1rem !important;
  border-radius: 0.375rem;
  margin: 0 0.15rem;
}
.nav-link:hover,
.nav-link.active {
  color: var(--nav-link-active-color) !important;
  transform: translateY(-1px);
  background-color: var(--nav-link-hover-bg);
}
body.dark-theme .navbar-toggler-icon {
  filter: invert(0.8) brightness(1.5);
}

/* --- Футер --- */
.footer {
  background-color: var(--footer-bg);
  color: var(--footer-color);
  padding: 1.25rem 0;
  position: fixed;
  bottom: 0;
  width: 100%;
  font-size: 0.875rem;
  z-index: 1020;
  box-shadow: 0 -2px 4px rgba(0, 0, 0, 0.1);
  transition: background-color 0.2s ease-in-out, color 0.2s ease-in-out;
}
.footer .container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
@media (max-width: 576px) {
  .footer .container {
    justify-content: center;
  }
}
.footer a {
  color: var(--footer-link-color);
}
.footer a:hover {
  color: var(--footer-link-hover-color);
}

/* --- Контейнер та картки --- */
.main-content-area {
  padding-left: 15px;
  padding-right: 15px;
  width: 100%;
  animation: fadeIn 0.4s ease-out forwards;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.card,
.bot-card {
  background-color: var(--card-bg);
  border: 1px solid var(--card-border-color);
  border-radius: 0.5rem;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.06);
  transition: all 0.2s ease-in-out;
  overflow: hidden;
  margin-bottom: 1.5rem;
}
.card:hover,
.bot-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08);
}
.card-header {
  background-color: var(--card-header-bg);
  color: var(--card-header-color); /* ЗАСТОСОВУЄМО ЗМІННУ */
  border-bottom: 1px solid var(--card-border-color);
  font-weight: 500;
  padding: 0.75rem 1rem;
  transition: all 0.2s ease-in-out;
}
/* Специфічні фони для card-header, якщо вони не використовують змінні */
.card-header.bg-primary {
  background-color: var(--btn-primary-bg) !important;
  color: var(--btn-primary-text) !important;
}
.card-header.bg-success {
  background-color: var(--alert-success-bg) !important;
  color: var(--alert-success-color) !important;
  border-bottom-color: var(--alert-success-border) !important;
}
.card-header.bg-danger {
  background-color: var(--alert-danger-bg) !important;
  color: var(--alert-danger-color) !important;
  border-bottom-color: var(--alert-danger-border) !important;
}
.card-header.bg-warning {
  background-color: var(--alert-warning-bg) !important;
  color: var(--alert-warning-color) !important;
  border-bottom-color: var(--alert-warning-border) !important;
}
.card-header.bg-dark {
  background-color: #343a40 !important;
  color: white !important;
} /* Залишаємо Bootstrap стандарт */
body.dark-theme .card-header.bg-dark {
  background-color: #212529 !important;
  color: #f8f9fa !important;
} /* Адаптація для темної теми */

.card-body {
  padding: 1rem;
  color: var(--text-color); /* ЗАСТОСОВУЄМО ОСНОВНИЙ КОЛІР ТЕКСТУ */
}
.card-body p,
.card-body h5,
.card-body strong {
  /* Переконуємось, що текст всередині картки теж змінює колір */
  color: var(--text-color);
}

.card-footer {
  background-color: var(--card-footer-bg);
  border-top: 1px solid var(--card-border-color);
  padding: 0.75rem 1rem;
  transition: all 0.2s ease-in-out;
}

/* --- Форми --- */
.form-label {
  font-weight: 500;
  margin-bottom: 0.3rem;
  color: var(--text-color); /* ЗАСТОСОВУЄМО ОСНОВНИЙ КОЛІР ТЕКСТУ */
}
.form-control,
.form-select {
  background-color: var(--input-bg);
  color: var(--input-color);
  border: 1px solid var(--input-border-color);
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  transition: all 0.2s ease-in-out;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.075);
}
.form-control:focus,
.form-select:focus {
  border-color: var(--input-focus-border-color);
  box-shadow: var(--input-focus-box-shadow);
  background-color: var(--input-bg);
  color: var(--input-color);
}
.form-control:disabled,
.form-control[readonly],
.form-select:disabled,
.form-select[readonly] {
  background-color: var(--input-disabled-bg) !important;
  color: var(--input-disabled-color) !important;
  border-color: var(--input-disabled-border-color) !important;
  opacity: 0.7;
}
.form-text {
  color: var(--text-muted-color);
  font-size: 0.85em;
}
.form-text code {
  background-color: var(--code-bg);
  color: var(--code-text-color);
  padding: 0.2em 0.4em;
  border-radius: 0.25rem;
}

/* --- Код та Логи --- */
.code-textarea {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier,
    monospace;
  background-color: var(--code-textarea-bg) !important;
  color: var(--code-textarea-color) !important;
  border: 1px solid var(--code-textarea-border);
  border-radius: 0.375rem;
  padding: 0.75rem;
  line-height: 1.5;
  font-size: 0.9em;
  min-height: 200px;
}
#logContentOutput {
  /* Завжди темний, як визначено в змінних */
  background-color: var(--log-output-bg) !important;
  color: var(--log-output-color) !important;
  padding: 0.75rem;
  border-radius: 0.375rem;
  max-height: 60vh;
  font-size: 0.85em;
}
pre {
  background-color: var(--pre-bg); /* Використовуємо нову змінну */
  color: var(--pre-text-color); /* Використовуємо нову змінну */
  padding: 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid var(--pre-border-color); /* Використовуємо нову змінну */
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 0.85em;
}

/* --- Повідомлення (Alerts) --- */
.alert {
  border-radius: 0.375rem;
  padding: 0.9rem 1.15rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
  animation: fadeIn 0.3s ease-out forwards;
}
.alert-dismissible .btn-close {
  padding: 1rem 1rem;
}
.alert-danger {
  background-color: var(--alert-danger-bg);
  color: var(--alert-danger-color);
  border: 1px solid var(--alert-danger-border);
}
.alert-success {
  background-color: var(--alert-success-bg);
  color: var(--alert-success-color);
  border: 1px solid var(--alert-success-border);
}
.alert-info {
  background-color: var(--alert-info-bg);
  color: var(--alert-info-color);
  border: 1px solid var(--alert-info-border);
}
.alert-warning {
  background-color: var(--alert-warning-bg);
  color: var(--alert-warning-color);
  border: 1px solid var(--alert-warning-border);
}

/* --- Кнопки --- */
.btn {
  border-radius: 0.375rem;
  padding: 0.45rem 0.9rem;
  font-weight: 500;
  transition: all 0.15s ease-in-out;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  border-width: 1px;
}
.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}
.btn:active {
  transform: translateY(0px);
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.06);
}
.btn-primary {
  background-color: var(--btn-primary-bg);
  border-color: var(--btn-primary-border);
  color: var(--btn-primary-text);
}
.btn-primary:hover {
  background-color: var(--btn-primary-hover-bg);
  border-color: var(--btn-primary-hover-border);
}
.btn-outline-secondary {
  color: var(--btn-outline-secondary-color);
  border-color: var(--btn-outline-secondary-border);
}
.btn-outline-secondary:hover {
  color: var(--btn-outline-secondary-hover-color);
  background-color: var(--btn-outline-secondary-hover-bg);
  border-color: var(--btn-outline-secondary-hover-border);
}

/* --- Значки (Badges) --- */
.badge {
  padding: 0.4em 0.6em;
  border-radius: 0.3rem;
  font-size: 0.8em;
  font-weight: 600;
}

/* --- Навігація по вкладках (Tabs) --- */
.nav-tabs {
  border-bottom: 1px solid var(--nav-tabs-border-color);
  margin-bottom: 1.5rem; /* Збільшено відступ */
}
.nav-tabs .nav-link {
  color: var(--nav-tabs-link-color);
  border-width: 1px;
  border-style: solid;
  border-color: transparent transparent var(--nav-tabs-border-color) transparent;
  margin-bottom: -1px;
  padding: 0.75rem 1.25rem; /* Збільшено падінги для кращого вигляду */
  border-top-left-radius: 0.375rem;
  border-top-right-radius: 0.375rem;
  transition: color 0.15s ease-in-out, background-color 0.15s ease-in-out,
    border-color 0.15s ease-in-out;
}
.nav-tabs .nav-link:hover,
.nav-tabs .nav-link:focus {
  border-color: var(--nav-tabs-link-hover-border-color)
    var(--nav-tabs-link-hover-border-color) var(--nav-tabs-border-color); /* Рамка при наведенні тепер чіткіша */
  color: var(--nav-tabs-link-hover-color);
  background-color: var(--card-header-bg); /* Легкий фон при наведенні */
  isolation: isolate;
}
.nav-tabs .nav-link.active {
  color: var(--nav-tabs-link-active-color) !important;
  background-color: var(--nav-tabs-link-active-bg) !important;
  border-color: var(--nav-tabs-link-active-border-color) !important;
  border-bottom-color: var(--nav-tabs-link-active-bg) !important;
  font-weight: 600; /* Активна вкладка жирніша */
}

/* --- Перемикач теми --- */
.theme-switch-wrapper {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
  color: var(--footer-color);
}
.theme-switch {
  display: inline-block;
  height: 20px;
  position: relative;
  width: 36px;
}
.theme-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: 0.3s;
}
body.dark-theme .slider {
  background-color: #555;
}
.slider:before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
}
input:checked + .slider {
  background-color: var(--link-color);
}
input:focus + .slider {
  box-shadow: 0 0 1px var(--link-color);
}
input:checked + .slider:before {
  transform: translateX(16px);
}
.slider.round {
  border-radius: 20px;
}
.slider.round:before {
  border-radius: 50%;
}

/* --- Адаптивність --- */
@media (max-width: 767.98px) {
  body {
    padding-top: 60px;
    padding-bottom: 100px;
  }
  .card,
  .bot-card {
    border-radius: 0.375rem;
  }
  .code-textarea {
    min-height: 180px;
    font-size: 0.8em;
  }
  .footer .container {
    flex-direction: column;
    gap: 0.75rem;
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
  }
  .theme-switch-wrapper {
    margin-top: 0.5rem;
  }
}

/* --- Утиліти --- */
.sticky-top {
  /* Для .sticky-top, якщо використовується, переконайтеся, що z-index правильний */
  z-index: 1010; /* Менше ніж navbar, але більше ніж звичайний контент */
}
