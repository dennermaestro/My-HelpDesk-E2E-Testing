const LABELS = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
};

const elements = {
  loginView: document.querySelector('#login-view'),
  loginForm: document.querySelector('#login-form'),
  loginSubmit: document.querySelector('[data-testid="login-submit"]'),
  loginError: document.querySelector('#login-error'),
  appView: document.querySelector('#app-view'),
  currentUser: document.querySelector('[data-testid="current-user"]'),
  logoutButton: document.querySelector('[data-testid="logout-button"]'),
  layout: document.querySelector('.layout'),
  ticketsPanel: document.querySelector('#tickets-panel'),
  tenantSelect: document.querySelector('#tenant-select'),
  form: document.querySelector('#ticket-form'),
  prioritySelect: document.querySelector('[data-testid="ticket-priority"]'),
  urgentOption: document.querySelector('[data-testid="ticket-priority"] option[value="urgent"]'),
  submitButton: document.querySelector('[data-testid="ticket-submit"]'),
  message: document.querySelector('#message'),
  statusFilter: document.querySelector('#status-filter'),
  list: document.querySelector('#ticket-list'),
  template: document.querySelector('#ticket-template'),
};

const state = { tenant: null, demoDefects: false, user: null };

// Mirrors the server's role rules only to decide what to show; the server enforces them.
const canListTickets = () => state.user?.role === 'admin';

async function api(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (state.tenant) headers['X-Tenant'] = state.tenant;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && data.error?.code === 'AUTH_REQUIRED') {
    showLogin();
  }
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Request failed with status ${response.status}`);
  }
  return data;
}

function showMessage(text, kind) {
  elements.message.textContent = text;
  elements.message.className = `message ${kind}`;
}

function badge(element, value) {
  element.textContent = LABELS[value] ?? value;
  element.className = `badge badge-${value}`;
  element.dataset.value = value;
}

function renderTickets(tickets) {
  elements.list.replaceChildren();
  if (tickets.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No tickets found.';
    elements.list.append(empty);
    return;
  }

  for (const ticket of tickets) {
    const item = elements.template.content.firstElementChild.cloneNode(true);
    item.dataset.ticketId = String(ticket.id);
    // textContent (never innerHTML) so user input can't inject markup.
    item.querySelector('[data-testid="ticket-id"]').textContent = `#${ticket.id}`;
    item.querySelector('[data-testid="ticket-item-title"]').textContent = ticket.title;
    item.querySelector('[data-testid="ticket-item-customer"]').textContent = ticket.customer_name;
    badge(item.querySelector('[data-testid="priority-badge"]'), ticket.priority);
    badge(item.querySelector('[data-testid="status-badge"]'), ticket.status);

    const statusSelect = item.querySelector('[data-testid="status-select"]');
    statusSelect.value = ticket.status;
    statusSelect.addEventListener('change', () => updateStatus(ticket.id, statusSelect));

    const suggestButton = item.querySelector('[data-testid="suggest-reply"]');
    const suggestion = item.querySelector('[data-testid="reply-suggestion"]');
    suggestButton.addEventListener('click', () => suggestReply(ticket.id, suggestButton, suggestion));

    elements.list.append(item);
  }
}

async function loadTickets() {
  if (!canListTickets()) return;
  const query = elements.statusFilter.value ? `?status=${encodeURIComponent(elements.statusFilter.value)}` : '';
  try {
    renderTickets(await api(`/tickets${query}`));
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function loadTenantSettings() {
  const { settings } = await api(`/tenants/${encodeURIComponent(state.tenant)}/settings`);
  // Planted defect (DEMO_DEFECTS=on): the form ignores the tenant flag and always offers "Urgent".
  const showUrgent = state.demoDefects || settings.urgent_priority === true;
  elements.urgentOption.hidden = !showUrgent;
  elements.urgentOption.disabled = !showUrgent;
  if (!showUrgent && elements.prioritySelect.value === 'urgent') {
    elements.prioritySelect.value = 'normal';
  }
}

async function selectTenant(tenantId) {
  state.tenant = tenantId;
  const url = new URL(window.location.href);
  url.searchParams.set('tenant', tenantId);
  window.history.replaceState(null, '', url);
  showMessage('', '');
  try {
    await loadTenantSettings();
  } catch (error) {
    showMessage(error.message, 'error');
  }
  await loadTickets();
}

async function createTicket(event) {
  event.preventDefault();
  const form = new FormData(elements.form);
  elements.submitButton.disabled = true;
  try {
    const ticket = await api('/tickets', {
      method: 'POST',
      body: {
        title: form.get('title'),
        customer_name: form.get('customer_name'),
        priority: form.get('priority'),
      },
    });
    showMessage(
      canListTickets() ? `Ticket #${ticket.id} created with priority ${LABELS[ticket.priority]}.` : `Ticket #${ticket.id} created.`,
      'success',
    );
    elements.form.reset();
    await loadTickets();
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    elements.submitButton.disabled = false;
  }
}

async function updateStatus(ticketId, select) {
  select.disabled = true;
  try {
    await api(`/tickets/${ticketId}`, { method: 'PATCH', body: { status: select.value } });
    showMessage(`Ticket #${ticketId} moved to ${LABELS[select.value]}.`, 'success');
    await loadTickets();
  } catch (error) {
    showMessage(error.message, 'error');
    select.disabled = false;
  }
}

async function suggestReply(ticketId, button, output) {
  button.disabled = true;
  try {
    const { reply } = await api(`/tickets/${ticketId}/suggest-reply`, { method: 'POST' });
    output.textContent = reply;
    output.hidden = false;
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function showLogin() {
  state.user = null;
  elements.appView.hidden = true;
  elements.loginView.hidden = false;
  elements.loginForm.querySelector('[name="username"]').focus();
  document.body.dataset.ready = 'true';
}

async function startPanel(user) {
  state.user = user;
  elements.loginView.hidden = true;
  elements.appView.hidden = false;
  elements.currentUser.textContent = `${user.username} (${user.role})`;
  if (!canListTickets()) {
    // Support only creates tickets, so the list is removed, not just hidden.
    elements.ticketsPanel.remove();
    elements.layout.classList.add('single');
  }

  try {
    const tenants = await api('/tenants');
    elements.tenantSelect.replaceChildren();
    for (const tenant of tenants) {
      elements.tenantSelect.append(new Option(tenant.name, tenant.id));
    }

    const requested = new URL(window.location.href).searchParams.get('tenant');
    const initial = tenants.some((t) => t.id === requested) ? requested : tenants[0]?.id;
    if (!initial) {
      showMessage('No clients configured.', 'error');
      return;
    }
    elements.tenantSelect.value = initial;
    await selectTenant(initial);
  } catch (error) {
    showMessage(`Could not load MultiDesk: ${error.message}`, 'error');
  } finally {
    document.body.dataset.ready = 'true';
  }
}

async function login(event) {
  event.preventDefault();
  const form = new FormData(elements.loginForm);
  elements.loginSubmit.disabled = true;
  elements.loginError.textContent = '';
  try {
    const user = await api('/login', {
      method: 'POST',
      body: { username: form.get('username'), password: form.get('password') },
    });
    elements.loginForm.reset();
    document.body.dataset.ready = 'false';
    await startPanel(user);
  } catch (error) {
    elements.loginError.textContent = error.message;
  } finally {
    elements.loginSubmit.disabled = false;
  }
}

async function logout() {
  await api('/logout', { method: 'POST' }).catch(() => {});
  // A fresh page load clears every bit of the previous user's state.
  window.location.reload();
}

async function init() {
  elements.loginForm.addEventListener('submit', login);
  elements.logoutButton.addEventListener('click', logout);
  elements.tenantSelect.addEventListener('change', () => selectTenant(elements.tenantSelect.value));
  elements.statusFilter.addEventListener('change', loadTickets);
  elements.form.addEventListener('submit', createTicket);

  try {
    const health = await api('/health');
    state.demoDefects = health.demo_defects === true;
  } catch (error) {
    showMessage(`Could not load MultiDesk: ${error.message}`, 'error');
  }

  let user;
  try {
    user = await api('/me');
  } catch {
    showLogin();
    return;
  }
  await startPanel(user);
}

init();
