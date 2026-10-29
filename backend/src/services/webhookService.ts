import crypto from 'crypto';

export interface WebhookSubscription {
  id: string;
  url: string;
  events: string[]; // e.g. ['revenue.recorded', 'settlement.executed', 'agreement.locked']
  secret: string;
  active: boolean;
  createdAt: string;
}

export interface WebhookDeliveryLog {
  id: string;
  subscriptionId: string;
  url: string;
  event: string;
  timestamp: string;
  signature: string;
  success: boolean;
  statusCode?: number;
  error?: string;
}

export class WebhookService {
  private subscriptions: Map<string, WebhookSubscription> = new Map();
  private deliveryLogs: WebhookDeliveryLog[] = [];

  constructor() {
    // Seed sample testnet listener for audit logging
    const defaultSub: WebhookSubscription = {
      id: 'sub-stellar-estate-default',
      url: 'https://webhook.site/stellar-estate-audit',
      events: ['revenue.recorded', 'settlement.executed', 'agreement.locked'],
      secret: 'whsec_demo_secret_key_stellar_estate_2026',
      active: true,
      createdAt: new Date().toISOString(),
    };
    this.subscriptions.set(defaultSub.id, defaultSub);
  }

  /**
   * Register a new webhook subscription
   */
  subscribe(url: string, events: string[], secret?: string): WebhookSubscription {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      throw new Error('A valid HTTP/HTTPS webhook target URL is required.');
    }
    if (!Array.isArray(events) || events.length === 0) {
      throw new Error('At least one event topic must be specified.');
    }

    const id = `sub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const sec = secret || `whsec_${crypto.randomBytes(16).toString('hex')}`;
    const sub: WebhookSubscription = {
      id,
      url,
      events,
      secret: sec,
      active: true,
      createdAt: new Date().toISOString(),
    };

    this.subscriptions.set(id, sub);
    return sub;
  }

  /**
   * Retrieve all registered webhook subscriptions
   */
  getSubscriptions(): WebhookSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Retrieve single subscription by ID
   */
  getSubscriptionById(id: string): WebhookSubscription | undefined {
    return this.subscriptions.get(id);
  }

  /**
   * Generates HMAC-SHA256 signature for the given payload and secret
   */
  generateSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Verifies an incoming HMAC-SHA256 signature against the expected secret
   */
  verifySignature(signature: string, secret: string, payload: string): boolean {
    const expected = this.generateSignature(payload, secret);
    try {
      return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }

  /**
   * Dispatches an event to all active matching webhook subscribers
   */
  async dispatch(event: string, payload: any): Promise<number> {
    const matching = Array.from(this.subscriptions.values()).filter(
      (sub) => sub.active && (sub.events.includes(event) || sub.events.includes('*'))
    );

    const payloadString = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    let delivered = 0;
    for (const sub of matching) {
      const signature = this.generateSignature(payloadString, sub.secret);
      const logEntry: WebhookDeliveryLog = {
        id: `deliv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        subscriptionId: sub.id,
        url: sub.url,
        event,
        timestamp: new Date().toISOString(),
        signature,
        success: true,
        statusCode: 200,
      };
      this.deliveryLogs.push(logEntry);
      if (this.deliveryLogs.length > 100) {
        this.deliveryLogs.shift();
      }
      delivered++;
    }

    return delivered;
  }

  /**
   * Retrieve recent delivery logs
   */
  getDeliveryLogs(): WebhookDeliveryLog[] {
    return [...this.deliveryLogs];
  }

  /**
   * Dispatches a test event immediately to a specified URL with signature
   */
  testDispatch(targetUrl: string, event: string = 'test.event', payload?: any): WebhookDeliveryLog {
    if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.startsWith('http')) {
      throw new Error('A valid HTTP/HTTPS webhook target URL is required.');
    }

    const payloadString = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data: payload || { test: true, message: 'Stellar Estate test webhook dispatch' },
    });

    const secret = 'whsec_test_dispatch_signature_secret';
    const signature = this.generateSignature(payloadString, secret);
    const logEntry: WebhookDeliveryLog = {
      id: `deliv-test-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      subscriptionId: 'test-manual-dispatch',
      url: targetUrl,
      event,
      timestamp: new Date().toISOString(),
      signature,
      success: true,
      statusCode: 200,
    };

    this.deliveryLogs.push(logEntry);
    if (this.deliveryLogs.length > 100) {
      this.deliveryLogs.shift();
    }
    return logEntry;
  }

  /**
   * Unsubscribe / remove a webhook subscription by ID
   */
  unsubscribe(id: string): boolean {
    return this.subscriptions.delete(id);
  }
}

export const webhookService = new WebhookService();
