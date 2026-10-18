"use strict";

class OutWestSepticQuoteForm {
  static counties = ["Palo Pinto", "Hood", "Erath", "Stephens", "Young", "Jack", "Eastland"];
  static services = ["New conventional system", "Drainfield install", "Soil/site evaluation", "Septic repair", "Inspection", "Tank lid riser", "Other"];
  static homeStatuses = ["New construction", "Existing home with failed system", "Existing home, no system yet", "Vacant land, planning a build", "Other"];

  static validateConfig(config) {
    if (!config || !["mailto", "webhook"].includes(config.submit_mode)) {
      throw new Error("Choose a valid submission mode in form-config.json.");
    }
    if (config.submit_mode === "mailto") {
      const email = config.recipient_email;
      if (typeof email !== "string" || !/^[^\s@<>,;:?&#]+@[^\s@<>,;:?&#]+\.[^\s@<>,;:?&#]+$/.test(email)) {
        throw new Error("Configure a valid recipient email address.");
      }
      return {submit_mode: "mailto", recipient_email: email};
    }
    let url;
    try { url = new URL(config.webhook_url); } catch { throw new Error("Configure an HTTPS form-service URL."); }
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      throw new Error("The form-service URL must use HTTPS without credentials or a fragment.");
    }
    return {submit_mode: "webhook", webhook_url: url.href};
  }

  static readRequest(data) {
    const limits = {name: 120, phone: 60, email: 254, address: 1200, county: 40, parcel: 120, home_status: 80, bedrooms: 2, notes: 5000};
    const request = {};
    for (const [key, limit] of Object.entries(limits)) {
      const value = data.get(key) ?? "";
      if (typeof value !== "string" || value.trim().length > limit) throw new Error(`Check the ${key.replaceAll("_", " ")} field.`);
      request[key] = value.trim();
    }
    for (const key of ["name", "phone", "address", "county", "home_status"]) {
      if (!request[key]) throw new Error(`Please enter ${key.replaceAll("_", " ")}.`);
    }
    if (!this.counties.includes(request.county)) throw new Error("Choose a listed county; confirm the property location with Out West Septic.");
    if (!this.homeStatuses.includes(request.home_status)) throw new Error("Choose a home status.");
    if (request.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.email)) throw new Error("Please check the email address.");
    if (request.bedrooms && (!/^\d+$/.test(request.bedrooms) || Number(request.bedrooms) < 1 || Number(request.bedrooms) > 10)) {
      throw new Error("Bedrooms must be a whole number from 1 to 10, or left blank.");
    }
    request.services = [...new Set(data.getAll("service"))];
    if (!request.services.length || request.services.some(value => !this.services.includes(value))) throw new Error("Choose at least one listed service topic.");
    return request;
  }

  static buildMessage(request) {
    return ["Out West Septic - quote inquiry", "", "Contact:", `Name: ${request.name}`, `Phone: ${request.phone}`,
      `Email: ${request.email || "(not provided)"}`, "", "Property:", `Address or location: ${request.address}`,
      `County: ${request.county}`, `Parcel: ${request.parcel || "(not provided)"}`, "", "Work:",
      `Topics: ${request.services.join(", ")}`, `Home status: ${request.home_status}`,
      `Bedrooms: ${request.bedrooms || "(not provided)"}`, `Notes: ${request.notes || "(none)"}`].join("\n");
  }

  static mailto(config, request) {
    return `mailto:${encodeURIComponent(config.recipient_email)}?subject=${encodeURIComponent("Quote inquiry: " + request.name.replace(/[\r\n]/g, " "))}&body=${encodeURIComponent(this.buildMessage(request))}`;
  }

  constructor(form, doc = document) {
    this.form = form;
    this.doc = doc;
    this.button = form.querySelector("button.primary");
    this.status = doc.getElementById("status");
    this.preview = doc.getElementById("draft-preview");
    this.busy = false;
    form.addEventListener("submit", event => { event.preventDefault(); this.submit(); });
    form.addEventListener("input", () => { this.preview.hidden = true; });
  }

  setStatus(message, kind = "") {
    this.status.textContent = message;
    this.status.className = "status" + (kind ? " " + kind : "");
  }

  async init() {
    try {
      const response = await fetch("form-config.json", {cache: "no-store", credentials: "omit"});
      if (!response.ok) throw new Error("Configuration could not be loaded.");
      this.config = OutWestSepticQuoteForm.validateConfig(await response.json());
      const mail = this.config.submit_mode === "mailto";
      this.button.textContent = mail ? "Prepare email draft" : "Send request";
      this.doc.getElementById("delivery-note").textContent = mail
        ? `Prepare and review an email to ${this.config.recipient_email}. Nothing is sent until you send it in your email app. Your email provider handles delivery.`
        : `Send these details to the configured form service at ${new URL(this.config.webhook_url).origin}. That service handles your information; confirm its privacy terms before sending.`;
      this.button.disabled = false;
      this.setStatus("");
    } catch {
      this.button.disabled = true;
      this.setStatus("The request form is unavailable because its delivery settings could not be loaded or validated. Use the official contact link below.", "err");
    }
  }

  async submit() {
    if (!this.config || this.busy) return;
    this.preview.hidden = true;
    if (!this.form.checkValidity()) {
      this.setStatus("Please check the required fields and their formats.", "err");
      this.form.reportValidity();
      return;
    }
    let request;
    try { request = OutWestSepticQuoteForm.readRequest(new FormData(this.form)); }
    catch (error) { this.setStatus(error.message, "err"); return; }
    if (this.config.submit_mode === "mailto") {
      const message = OutWestSepticQuoteForm.buildMessage(request);
      const url = OutWestSepticQuoteForm.mailto(this.config, request);
      this.doc.getElementById("draft-text").value = message;
      this.doc.getElementById("draft-recipient").textContent = this.config.recipient_email;
      const link = this.doc.getElementById("open-draft");
      // Mail apps impose different URI limits. Preserve long requests as copyable text.
      link.hidden = url.length > 1800;
      if (link.hidden) link.removeAttribute("href"); else link.href = url;
      this.preview.hidden = false;
      this.setStatus(link.hidden
        ? "Draft prepared, not sent. This request is long; copy the full text below into your email app."
        : "Draft prepared, not sent. Review it below, then open your email app and send it yourself.");
      return;
    }
    this.busy = true;
    this.button.disabled = true;
    this.setStatus("Sending to the configured form service...");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(this.config.webhook_url, {
        method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(request),
        signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error"
      });
      if (!response.ok) throw new Error("Request not accepted");
      this.setStatus("The form service accepted your request. Delivery to Out West Septic and a reply are not yet confirmed. Your details remain below.", "ok");
    } catch {
      this.setStatus("No confirmation was received. Your details are still here; check receipt with Out West Septic before retrying to avoid duplicate requests.", "err");
    } finally {
      clearTimeout(timeout);
      this.busy = false;
      this.button.disabled = false;
    }
  }
}

if (typeof module !== "undefined" && module.exports) module.exports = {OutWestSepticQuoteForm};
if (typeof document !== "undefined") new OutWestSepticQuoteForm(document.getElementById("quote-form")).init();
