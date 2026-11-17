// Tabla mundial de récords, sin servidor propio: cada jugador deja su mejor tiempo (con su fantasma) como mensaje
// retenido en los servidores MQTT públicos que ya usa el online, y al consultar se juntan los de los tres.
// Es pública y no se comprueba: cualquiera puede leerla y escribir en ella.
const BROKERS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
const TOPIC = 'jettism/v1/records/';
const rid = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const okKey = k => /^[a-z0-9]{1,24}$/.test(k);

export class Board {
  constructor() { this.clients = []; this.ready = null; this.idle = null; }

  // Se conecta a los servidores que respondan (los tres a la vez); se desconecta solo tras un minuto sin usarse
  connect() {
    if (this.ready) return this.ready;
    if (typeof mqtt !== 'object' || typeof mqtt.connect !== 'function') return Promise.resolve([]);
    this.ready = Promise.allSettled(BROKERS.map(url => new Promise((res, rej) => {
      const c = mqtt.connect(url, { clientId: 'jtr_' + rid(10), clean: true, connectTimeout: 6000, reconnectPeriod: 0, keepalive: 30 });
      const t = setTimeout(() => { c.end(true); rej(new Error('tiempo agotado')); }, 7000);
      c.on('connect', () => { clearTimeout(t); res(c); });
      c.on('error', () => { /* se ignora: basta con que responda uno */ });
    }))).then(rs => (this.clients = rs.filter(r => r.status === 'fulfilled').map(r => r.value)));
    return this.ready;
  }
  touch() {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => { for (const c of this.clients) c.end(true); this.clients = []; this.ready = null; }, 60000);
  }

  // Lista de un mapa o circuito (key), del mejor al peor; un jugador aparece una vez, con su mejor tiempo
  // check(e): descarta lo que no tenga sentido (tiempos imposibles…)
  async fetch(key, check = () => true, wait = 2600) {
    if (!okKey(key)) return [];
    const cs = await this.connect();
    if (!cs.length) throw new Error('sin conexión con los servidores');
    const best = new Map(), base = TOPIC + key + '/';
    const onMsg = (tp, payload) => {
      if (!tp.startsWith(base) || payload.length > 80000) return;
      const pid = tp.slice(base.length);
      if (!/^[a-z0-9]{6,16}$/.test(pid)) return;
      try {
        const e = JSON.parse(new TextDecoder().decode(payload));
        if (typeof e.t !== 'number' || !isFinite(e.t) || typeof e.n !== 'string' || !check(e)) return;
        const prev = best.get(pid);
        if (!prev || e.t < prev.t) best.set(pid, { ...e, pid });
      } catch { /* mensaje roto */ }
    };
    for (const c of cs) { c.on('message', onMsg); c.subscribe(base + '+', { qos: 0 }); }
    await sleep(wait);
    for (const c of cs) { c.unsubscribe(base + '+'); c.removeListener('message', onMsg); }
    this.touch();
    return [...best.values()].sort((a, b) => a.t - b.t);
  }

  // Deja (o cambia) mi récord: mensaje retenido en cada servidor que responda
  async publish(key, pid, entry) {
    if (!okKey(key)) return 0;
    const cs = await this.connect(), msg = JSON.stringify(entry);
    await Promise.all(cs.map(c => new Promise(res => c.publish(TOPIC + key + '/' + pid, msg, { qos: 1, retain: true }, () => res()))));
    this.touch();
    return cs.length;
  }
}
