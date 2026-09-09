/* ═══════════════════════════════════════════════════════════════
   QR payload builders. Each returns the exact string that gets
   encoded, so what you scan is what you typed.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* WIFI and MECARD style payloads use backslash escaping for the
     characters that would otherwise end a field. */
  const esc = s => String(s || '').replace(/([\;,":])/g, '\\$1');
  const enc = s => encodeURIComponent(String(s || ''));

  const BUILD = {
    url(v) {
      let u = (v.url || '').trim();
      if (u && !/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
      return u;
    },

    text: v => v.text || '',

    /* India's UPI deep link. Scanning it opens any UPI app with the
       payee, and the amount already filled in. */
    upi(v) {
      const p = [];
      if (v.upiId)   p.push('pa=' + enc(v.upiId.trim()));
      if (v.upiName) p.push('pn=' + enc(v.upiName.trim()));
      if (v.upiAmount) p.push('am=' + enc(String(v.upiAmount)));
      if (v.upiNote) p.push('tn=' + enc(v.upiNote.trim()));
      p.push('cu=INR');
      return p.length ? 'upi://pay?' + p.join('&') : '';
    },

    wifi(v) {
      if (!v.ssid) return '';
      const t = v.wifiAuth || 'WPA';
      let s = 'WIFI:T:' + t + ';S:' + esc(v.ssid) + ';';
      if (t !== 'nopass') s += 'P:' + esc(v.wifiPass) + ';';
      if (v.wifiHidden) s += 'H:true;';
      return s + ';';
    },

    vcard(v) {
      if (!v.vName && !v.vPhone) return '';
      const L = ['BEGIN:VCARD', 'VERSION:3.0'];
      if (v.vName)  { L.push('N:' + esc(v.vName)); L.push('FN:' + esc(v.vName)); }
      if (v.vOrg)   L.push('ORG:' + esc(v.vOrg));
      if (v.vTitle) L.push('TITLE:' + esc(v.vTitle));
      if (v.vPhone) L.push('TEL;TYPE=CELL:' + esc(v.vPhone));
      if (v.vEmail) L.push('EMAIL:' + esc(v.vEmail));
      if (v.vUrl)   L.push('URL:' + esc(v.vUrl));
      L.push('END:VCARD');
      return L.join('\n');
    },

    email(v) {
      if (!v.to) return '';
      const q = [];
      if (v.subject) q.push('subject=' + enc(v.subject));
      if (v.body)    q.push('body=' + enc(v.body));
      return 'mailto:' + v.to.trim() + (q.length ? '?' + q.join('&') : '');
    },

    sms(v) {
      if (!v.smsTo) return '';
      return 'SMSTO:' + v.smsTo.trim() + (v.smsBody ? ':' + v.smsBody : '');
    },

    phone: v => v.tel ? 'tel:' + v.tel.trim() : '',

    geo(v) {
      if (v.lat === '' || v.lng === '') return '';
      return 'geo:' + Number(v.lat) + ',' + Number(v.lng);
    }
  };

  /* Rough guidance on how small a printed code can get and still scan.
     Scanners need roughly 2 to 3 pixels per module, and printers need
     about 0.4 mm per module for a reliable read. */
  function printAdvice(moduleCount) {
    const mm = Math.ceil(moduleCount * 0.4) + 8;   // + quiet zone both sides
    return { modules: moduleCount, minPrintMm: mm };
  }

  global.QRPayloads = { BUILD, printAdvice };
})(window);
