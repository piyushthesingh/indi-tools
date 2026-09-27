/* Quick add / edit sheet.

   Fast path for a new expense: tap +, type the amount, tap a category.
   Tapping a category saves straight away when the amount is valid and
   "More" is closed. With "More" open, when editing, or when opened from a
   deep link, category chips only select and Save does the saving. */

import { h, mount, icon } from './dom.js';
import { glyph } from './caticon.js';
import { openSheet } from './sheet.js';
import { toast } from './toast.js';
import {
  state, activeAccounts, accountById, categoryById,
  addTransaction, updateTransaction, deleteTransaction, restoreTransaction,
} from '../state.js';
import { GROUPS, SPENDABLE_KINDS } from '../lib/defaults.js';
import { parseAmount, formatINR, paiseToInput, isExpression } from '../lib/money.js';
import { todayStr, addDays, formatShort, formatDayHeader, toDateStr } from '../lib/dates.js';
import { TYPE_LABELS, validateTransaction } from '../lib/transactions.js';
import { rankCategories, lastUsedAccountId, payeeList, lastCategoryForPayee } from '../lib/suggest.js';
import { cardSummary } from '../lib/cycles.js';
import { openRuleEditor } from './recurring.js';

export function openQuickAdd({ edit = null, prefill = {}, fromLink = false, onSave = null } = {}) {
  const today = todayStr();
  const accounts = activeAccounts();
  // an edited transaction may point at an archived account; keep it pickable
  const pickable = (id) => accounts.some((a) => a.id === id) ? accounts : [...accounts, accountById(id)].filter(Boolean);

  const src = edit || prefill;
  const m = {
    type: src.type || 'expense',
    amountText: src.amount ? paiseToInput(src.amount) : '',
    accountId: src.accountId || null,
    toAccountId: src.toAccountId || null,
    categoryId: src.categoryId || null,
    categoryPicked: !!src.categoryId,
    accountPicked: !!src.accountId,
    payee: src.payee || '',
    note: src.note || '',
    date: src.date || today,
    noteOpen: !!(edit?.note || src.note),
  };
  if (!m.accountId) {
    const usable = accounts.filter((a) => m.type === 'transfer' || SPENDABLE_KINDS.includes(a.kind));
    const ids = usable.filter((a) => a.id !== m.toAccountId).map((a) => a.id);
    // paying a card or investing: default "from" to a bank or cash, not a card or investment
    const nonCard = usable.filter((a) => a.kind !== 'credit_card' && a.kind !== 'investment' && a.id !== m.toAccountId).map((a) => a.id);
    m.accountId = lastUsedAccountId(state.transactions, m.toAccountId && nonCard.length ? nonCard : ids, m.type);
  }

  // the fast path: a category tap saves. Not while editing, reviewing a link,
  // on transfers, or once "Add a note" is open (they are still typing)
  const autoSave = () => !edit && !fromLink && !m.noteOpen && m.type !== 'transfer';

  /* ─── persistent pieces (kept across re-renders so focus survives) ─── */
  const amount = h('input', {
    id: 'qa-amount', class: 'amount-field', type: 'text', inputmode: 'decimal', enterkeyhint: 'next',
    autocomplete: 'off', placeholder: '0', 'aria-describedby': 'qa-amount-calc qa-error', value: m.amountText,
    oninput: () => { m.amountText = amount.value; showCalc(); clearError(); },
    // keyboard "Next" goes on to the payee
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); payee.focus(); } },
  });

  /* Payee or title, upfront and optional. A payee used before brings back
     its last category. "Done" closes the keyboard so the chips show. */
  const payeeLabel = h('label', { for: 'qa-payee' });
  const payee = h('input', {
    id: 'qa-payee', type: 'text', list: 'qa-payees', autocomplete: 'off', autocapitalize: 'sentences',
    enterkeyhint: 'done', value: m.payee, maxlength: 80,
    oninput: () => {
      m.payee = payee.value;
      if (m.categoryPicked || m.type === 'transfer') return;
      const cat = lastCategoryForPayee(state.transactions, m.payee, m.type);
      if (cat && cat !== m.categoryId) { m.categoryId = cat; renderCats(); revealSelected(catsEl); }
    },
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); payee.blur(); } },
  });
  const payeeField = h('div', { class: 'field payee-field' },
    payeeLabel, payee,
    h('datalist', { id: 'qa-payees' }, payeeList(state.transactions).map((p) => h('option', { value: p }))));
  function renderPayeeLabel() {
    payeeLabel.textContent = m.type === 'transfer' ? 'Title (optional)' : m.type === 'income' ? 'From or title (optional)' : 'Payee or title (optional)';
    payee.placeholder = m.type === 'transfer' ? 'e.g. Card bill' : m.type === 'income' ? 'e.g. Acme salary' : 'e.g. Swiggy, Rent, Movie night';
  }
  const calc = h('p', { class: 'calc', id: 'qa-amount-calc' });
  const errorEl = h('p', { class: 'error', id: 'qa-error', role: 'alert' });
  const opBtn = (op, label) => h('button', {
    type: 'button', class: 'op', 'aria-label': label, text: op,
    // keep the keyboard up: don't let the tap move focus off the amount
    onpointerdown: (e) => e.preventDefault(),
    onclick: () => {
      amount.value = amount.value.replace(/[+\-−×*/]\s*$/, '') + op;
      m.amountText = amount.value;
      amount.focus();
      showCalc();
    },
  });

  const titleEl = h('span');
  const typeEl = h('div');
  const accountsEl = h('div');
  const catsEl = h('div');
  const moreEl = h('div');
  const footEl = h('div', { class: 'qa-foot' });

  function showCalc() {
    const p = parseAmount(m.amountText);
    calc.textContent = isExpression(m.amountText) && p != null ? '= ' + formatINR(p) : '';
  }
  function clearError() { errorEl.textContent = ''; }
  function fail(msg, focusEl) {
    errorEl.textContent = msg;
    focusEl?.focus();
  }

  /* ─── sections ─── */

  function renderTitle() {
    const to = accountById(m.toAccountId);
    const label = m.type !== 'transfer' ? TYPE_LABELS[m.type]
      : to?.kind === 'credit_card' ? 'Card payment' : to?.kind === 'investment' ? 'Investment' : TYPE_LABELS.transfer;
    titleEl.textContent = edit ? 'Edit ' + label.toLowerCase() : 'Add ' + label.toLowerCase();
  }

  function renderType() {
    mount(typeEl, h('div', { class: 'seg small', role: 'radiogroup', 'aria-label': 'Type' },
      Object.entries(TYPE_LABELS).map(([k, label]) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(m.type === k), class: m.type === k ? 'on' : '', text: label,
        onpointerdown: (e) => { if (document.activeElement === amount) e.preventDefault(); },
        onclick: () => setType(k),
      }))));
  }

  function setType(k) {
    if (m.type === k) return;
    const wasCatType = m.type === 'income' ? 'income' : 'expense';
    m.type = k;
    const nowCatType = k === 'income' ? 'income' : 'expense';
    if (wasCatType !== nowCatType) {
      m.categoryId = null;
      m.categoryPicked = false;
      if (m.payee && k !== 'transfer') m.categoryId = lastCategoryForPayee(state.transactions, m.payee, k);
    }
    if (k === 'transfer') { m.toAccountId = null; }
    else if (accountById(m.accountId)?.kind === 'investment') { m.accountId = null; m.accountPicked = false; }
    // only re-default the method if the user has not chosen one themselves
    const allowed = accounts.filter((a) => k === 'transfer' || SPENDABLE_KINDS.includes(a.kind)).map((a) => a.id);
    if (!edit && !m.accountPicked) {
      let pick = lastUsedAccountId(state.transactions, allowed, k);
      // no transfer yet: money usually moves out of a bank or UPI, not a card
      if (!pick && k === 'transfer' && accountById(m.accountId)?.kind === 'credit_card') {
        pick = accounts.find((a) => allowed.includes(a.id) && ['bank', 'upi', 'wallet', 'cash'].includes(a.kind))?.id;
      }
      m.accountId = pick || m.accountId;
    }
    clearError();
    renderAll();
  }

  function accountChips(selectedId, onPick, { exclude } = {}) {
    const list = pickable(selectedId).filter((a) => a.id !== exclude
      && (m.type === 'transfer' || SPENDABLE_KINDS.includes(a.kind)));
    if (!list.length) return h('p', { class: 'hint', text: 'No payment methods yet. Add one in Accounts.' });
    return h('div', { class: 'chips' },
      GROUPS.map((g, gi) => {
        const inGroup = list.filter((a) => g.kinds.includes(a.kind));
        if (!inGroup.length) return null;
        return [
          gi > 0 && h('span', { class: 'chip-sep', 'aria-hidden': 'true' }),
          inGroup.map((a) => h('button', {
            type: 'button', class: 'chip' + (a.id === selectedId ? ' on' : ''), style: { '--c': a.color },
            'aria-pressed': String(a.id === selectedId), title: g.name,
            onpointerdown: (e) => { if (document.activeElement === amount) e.preventDefault(); },
            onclick: () => onPick(a.id),
          }, h('span', { class: 'dot' }), a.name)),
        ];
      }));
  }

  function renderAccounts() {
    if (m.type !== 'transfer') {
      const label = { expense: 'Paid with', income: 'Received in', refund: 'Refunded to' }[m.type];
      mount(accountsEl,
        h('h3', { class: 'label', text: label }),
        accountChips(m.accountId, (id) => { m.accountId = id; m.accountPicked = true; clearError(); renderAccounts(); }));
      revealSelected(accountsEl);
      return;
    }
    const to = accountById(m.toAccountId);
    let suggest = null;
    if (to?.kind === 'credit_card') {
      const s = cardSummary(to, state.transactions, today);
      const options = [];
      if (s.billedDue > 0) options.push(['Billed due', s.billedDue]);
      if (s.outstanding > 0 && s.outstanding !== s.billedDue) options.push(['Total owed', s.outstanding]);
      if (options.length) {
        suggest = h('div', { class: 'chips suggest' }, options.map(([label, v]) => h('button', {
          type: 'button', class: 'chip', onclick: () => {
            amount.value = m.amountText = paiseToInput(v);
            showCalc();
            clearError();
          },
        }, label + ' ' + formatINR(v))));
      }
    }
    mount(accountsEl,
      h('h3', { class: 'label', text: 'From' }),
      accountChips(m.accountId, (id) => {
        m.accountId = id;
        m.accountPicked = true;
        if (m.toAccountId === id) m.toAccountId = null;
        clearError(); renderAccounts(); renderTitle();
      }),
      h('h3', { class: 'label', text: to?.kind === 'credit_card' ? 'To (card payment)' : 'To' }),
      accountChips(m.toAccountId, (id) => {
        m.toAccountId = id;
        const acc = accountById(id);
        // paying a card: offer what is billed, and fill it in if nothing is typed yet
        if (acc?.kind === 'credit_card' && !parseAmount(m.amountText)) {
          const s = cardSummary(acc, state.transactions, today);
          if (s.billedDue > 0) { amount.value = m.amountText = paiseToInput(s.billedDue); showCalc(); }
        }
        clearError(); renderAccounts(); renderTitle();
      }, { exclude: m.accountId }),
      suggest,
    );
    revealSelected(accountsEl);
  }

  function renderCats() {
    if (m.type === 'transfer') { mount(catsEl); return; }
    const cats = rankCategories(state.categories, state.transactions, m.type);
    const current = m.categoryId && !cats.some((c) => c.id === m.categoryId) ? categoryById(m.categoryId) : null;
    mount(catsEl,
      h('h3', { class: 'label', text: autoSave() ? 'Category · tap to save' : 'Category' }),
      h('div', { class: 'chips cats' },
        [...(current ? [current] : []), ...cats].map((c) => h('button', {
          type: 'button', class: 'chip cat' + (c.id === m.categoryId ? ' on' : ''), style: { '--c': c.color },
          'aria-pressed': String(c.id === m.categoryId),
          onclick: () => {
            m.categoryId = c.id;
            m.categoryPicked = true;
            clearError();
            if (autoSave() && parseAmount(m.amountText) > 0) { save(); return; }
            renderCats();
            if (autoSave()) fail('Enter an amount first.', amount);
          },
        }, glyph(c, 'emoji'), c.name))));
  }

  function renderMore() {
    if (!m.noteOpen) {
      mount(moreEl, h('button', {
        type: 'button', class: 'link-btn', 'aria-expanded': 'false',
        onclick: () => { m.noteOpen = true; renderMore(); renderCats(); moreEl.querySelector('input')?.focus(); },
      }, 'Add a note'));
      return;
    }
    mount(moreEl,
      h('div', { class: 'field' },
        h('label', { for: 'qa-note', text: 'Note' }),
        h('input', { id: 'qa-note', type: 'text', value: m.note, maxlength: 200, enterkeyhint: 'done', oninput: (e) => { m.note = e.target.value; } })),
    );
  }

  /* Today and Yesterday as chips, plus a chip that opens the native date
     picker for anything older (or a future date). */
  const dateEl = h('div', { class: 'date-row' });
  function renderDate() {
    const yesterday = addDays(today, -1);
    const other = m.date !== today && m.date !== yesterday;
    const picker = h('input', {
      type: 'date', class: 'date-overlay', value: m.date, 'aria-label': 'Pick a date', required: true,
      onchange: (e) => { if (e.target.value) { m.date = e.target.value; renderDate(); } },
    });
    const chip = (label, d) => h('button', {
      type: 'button', class: 'chip sm' + (m.date === d ? ' on' : ''), 'aria-pressed': String(m.date === d), text: label,
      onpointerdown: (e) => { if (document.activeElement === amount) e.preventDefault(); },
      onclick: () => { m.date = d; renderDate(); },
    });
    mount(dateEl,
      h('span', { class: 'label inline', text: 'Date' }),
      chip('Today', today),
      chip('Yesterday', yesterday),
      h('span', {
        class: 'chip sm pick' + (other ? ' on' : ''),
        onclick: () => { try { picker.showPicker?.(); } catch { /* not allowed here; the overlay input still opens it */ } },
      }, icon('calendar', 'ico sm'), other ? formatDayHeader(m.date, today) : 'Pick date', picker),
    );
  }

  let confirmingDelete = false;
  function renderFoot() {
    footEl.classList.remove('two', 'confirm');
    if (edit && confirmingDelete) {
      // ask first: deleting takes it out of history and every total
      const what = edit.type === 'transfer' ? 'transfer' : TYPE_LABELS[edit.type].toLowerCase();
      footEl.classList.add('confirm');
      mount(footEl,
        h('p', { class: 'confirm-text', role: 'alert' },
          h('strong', { text: `Delete this ${formatINR(edit.amount)} ${what}?` }),
          ' It will be removed from your history and totals.'),
        h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => { confirmingDelete = false; renderFoot(); } }),
        h('button', { type: 'button', class: 'btn danger-fill', text: 'Delete', onclick: remove }));
      footEl.querySelector('.btn')?.focus();
      return;
    }
    mount(footEl,
      edit ? h('button', { type: 'button', class: 'btn danger', text: 'Delete', onclick: () => { confirmingDelete = true; renderFoot(); } }) : null,
      h('button', { type: 'button', class: 'btn primary', text: 'Save', onclick: save }));
    footEl.classList.toggle('two', !!edit);
  }

  function renderAll() {
    renderTitle(); renderType(); renderPayeeLabel(); renderAccounts(); renderCats(); renderFoot();
  }

  /* bring selected chips into view in their scrolling rows */
  function revealSelected(root) {
    for (const on of root.querySelectorAll('.chips .chip.on')) {
      const row = on.closest('.chips');
      if (row.scrollWidth > row.clientWidth) row.scrollLeft = on.offsetLeft - row.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
    }
  }

  /* ─── actions ─── */

  let busy = false;
  async function save() {
    if (busy) return;
    const fields = {
      type: m.type, amount: parseAmount(m.amountText), date: m.date,
      accountId: m.accountId, toAccountId: m.toAccountId, categoryId: m.categoryId,
      payee: m.payee, note: m.note,
    };
    const err = validateTransaction(fields);
    if (err) {
      const focus = /amount/i.test(err) ? amount : null;
      fail(err, focus);
      return;
    }
    busy = true;
    try {
      if (onSave) {
        await onSave(fields);
        sheet.close({ restoreFocus: false });
        toast(`Logged ${formatINR(fields.amount)}`);
      } else if (edit) {
        await updateTransaction(edit, fields);
        sheet.close({ restoreFocus: false });
        toast('Saved');
      } else {
        const t = await addTransaction(fields);
        sheet.close();
        const what = t.type === 'transfer' ? '' : ' · ' + (categoryById(t.categoryId)?.name ?? '');
        toast(`Saved ${formatINR(t.amount)}${what}`, {
          duration: 5000,
          actions: [
            { label: 'Undo', run: () => deleteTransaction(t.id) },
            { label: 'Add another', run: () => openQuickAdd({ prefill: { type: t.type, accountId: t.accountId } }) },
          ],
        });
      }
    } catch (e) {
      busy = false;
      fail(e.message || 'Could not save.');
    }
  }

  async function remove() {
    const t = await deleteTransaction(edit.id);
    sheet.close({ restoreFocus: false });
    if (t) toast(`Deleted ${formatINR(t.amount)}`, { duration: 5000, action: 'Undo', onAction: () => restoreTransaction(t) });
  }

  /* ─── assemble ─── */

  const body = h('div', { class: 'qa' },
    typeEl,
    h('div', { class: 'amount-row' },
      h('label', { for: 'qa-amount', class: 'sr-only', text: 'Amount in rupees' }),
      h('span', { class: 'cur', 'aria-hidden': 'true', text: '₹' }),
      amount,
      h('div', { class: 'ops' }, opBtn('+', 'Plus'), opBtn('−', 'Minus'))),
    calc,
    errorEl,
    payeeField,
    dateEl,
    accountsEl,
    catsEl,
    moreEl,
    edit && h('p', { class: 'hint meta' },
      `Added ${formatShort(toDateStr(new Date(edit.createdAt)), today)}`,
      edit.recurringId ? ' · from a recurring item' : ' · ',
      !edit.recurringId && h('button', {
        type: 'button', class: 'link-btn inline', text: 'Make it recurring',
        onclick: () => { sheet.close({ restoreFocus: false }); openRuleEditor(null, { from: edit }); },
      })),
  );

  const sheet = openSheet({ title: titleEl, body, footer: footEl });
  renderAll();
  renderDate();
  renderMore();
  showCalc();
  revealSelected(body);
  // focus inside the same tap that opened the sheet, so iOS raises the keypad
  if (!edit) {
    amount.focus({ preventScroll: true });
  } else {
    const title = sheet.el.querySelector('.sheet-title');
    title.setAttribute('tabindex', '-1');
    title.focus();
  }
  return sheet;
}
