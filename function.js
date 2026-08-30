import ManualJS from "./manual.js";
import axios from "axios";
import * as cheerio from "cheerio";
import pkg from "https-proxy-agent";

const { HttpsProxyAgent } = pkg;

// Ubah format proxy "host:port[:user:pass]" menjadi URL yang dikenali
// HttpsProxyAgent: "http://user:pass@host:port".
const toProxyUrl = (proxy) => {
  if (!proxy) return null;
  const p = proxy.replace(/^(?:http|https|socks4|socks5):\/\//i, "");
  const parts = p.split(":");
  if (parts.length < 2) return null;
  const host = parts[0];
  const port = parts[1];
  if (parts.length >= 4) {
    const user = parts[2];
    const pass = parts.slice(3).join(":");
    return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  }
  return `http://${host}:${port}`;
};

// Bangun konfigurasi axios dengan proxy opsional (format host:port[:user:pass]).
const withProxy = (baseConfig, proxy) => {
  const url = toProxyUrl(proxy);
  if (!url) return baseConfig;
  try {
    const agent = new HttpsProxyAgent(url);
    return { ...baseConfig, httpsAgent: agent, proxy: false };
  } catch {
    return baseConfig;
  }
};

const encryptTimers = (number) =>
  new Promise((resolve, reject) => {
    const result = ManualJS.MDX.goinstring(
      number,
      ManualJS.jun.Des.parse("79540e250fdb16afac03e19c46dbdeb3"),
      { ii: ManualJS.jun.Des.parse("eb2bb9425e81ffa942522e4414e95bd0") }
    ).rabbittext.toString(ManualJS.jun.Text21);
    resolve(encodeURIComponent(result));
  });

const getCSRFData = async (number, proxy) => {
  const response = await axios.get(
    `https://cekresi.com/?noresi=${number}&e=JET`,
    withProxy(
      {
        timeout: 30_000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      },
      proxy
    )
  );

  const $ = cheerio.load(response.data);
  const viewstate = $('input[name="viewstate"]').val();
  const secret_key = $('input[name="secret_key"]').val();
  return { viewstate, secret_key };
};

const scrapeResiData = (html) => {
  const $ = cheerio.load(html);
  const expedisi = $(".alert.alert-success strong").eq(1).text();
  const noResi = $(".alert.alert-success strong").eq(2).text();
  const pengirim = $('td:contains("Dikirim oleh")').next().next().text().trim();
  const tujuan = $('td:contains("Dikirim ke")')
    .next()
    .next()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  const status = $("#status_resi").text().trim();
  const tanggalKirim = $('td:contains("Dikirim tanggal")')
    .next()
    .next()
    .text()
    .trim();
  const penerima = $("#last_position").text().trim();

  const perjalanan = [];
  $("#collapseTwo .table tr").each((i, row) => {
    const tanggal = $(row).find("td").eq(0).text().trim();
    const keterangan = $(row).find("td").eq(1).text().trim();
    if (tanggal && keterangan && tanggal !== "Tanggal") {
      perjalanan.push({ tanggal, keterangan });
    }
  });

  return {
    expedisi,
    noResi,
    pengirim,
    tujuan,
    status,
    tanggalKirim,
    penerima,
    perjalanan,
  };
};

const getResiTracking = (number, csrf, timers, proxy) =>
  new Promise(async (resolve, reject) => {
    try {
      const postData = `viewstate=${csrf.viewstate}&secret_key=${csrf.secret_key}&e=JET&noresi=${number}&timers=${timers}`;
      const getResponse = await axios.post(
        `https://apa2.cekresi.com/cekresi/resi/initialize.php?ui=736e77d7368d37887d7302c605acc786&p=1&w=kdr3vj`,
        postData,
        withProxy(
          {
            method: "POST",
            timeout: 30_000,
            headers: {
              Host: "apa2.cekresi.com",
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:87.0) Gecko/20100101 Firefox/87.0",
              Accept: "*/*",
              "Accept-Language": "id,en-US;q=0.7,en;q=0.3",
              "Accept-Encoding": "gzip, deflate",
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "Content-Length": "124",
              Origin: "https://cekresi.com",
              Referer: "https://cekresi.com/",
              "Cache-Control": "max-age=0",
            },
          },
          proxy
        )
      );
      const resiData = scrapeResiData(getResponse.data);

      // Deteksi data kosong: cekresi.com kadang membalas HTML tanpa data
      // (expedisi/noResi/status/penerima kosong). Jangan dianggap valid.
      const isEmpty =
        !resiData ||
        (resiData.noResi.trim() === "" &&
          resiData.expedisi.trim() === "" &&
          resiData.penerima.trim() === "" &&
          resiData.status.trim() === "");

      if (resiData && !isEmpty) {
        resolve({
          valid: true,
          data: resiData,
        });
      } else {
        resolve({
          valid: false,
          message: "Data tidak valid atau tidak ditemukan",
        });
      }
    } catch (err) {
      resolve({
        valid: false,
        message: err instanceof Error ? err.message : String(err?.error || err),
      });
    }
  });

export { getCSRFData, encryptTimers, getResiTracking };
