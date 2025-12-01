const API_BASE = '/api';

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export const aiAPI = {
  async taekbotResponse(message: string, context: { clubName?: string; artType?: string; language?: string }) {
    const result = await fetchAPI('/ai/taekbot', {
      method: 'POST',
      body: JSON.stringify({
        message,
        clubName: context.clubName,
        artType: context.artType,
        language: context.language,
      }),
    });
    return result.response;
  },

  async generateClassPlan(params: {
    beltLevel: string;
    focusArea: string;
    classDuration: number;
    studentCount: number;
    language: string;
  }) {
    const result = await fetchAPI('/ai/class-plan', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return result.plan;
  },

  async generateWelcomeEmail(params: {
    clubName: string;
    studentName: string;
    parentName: string;
    artType: string;
    language: string;
  }) {
    const result = await fetchAPI('/ai/welcome-email', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return result.email;
  },
};

export const stripeAPI = {
  async getPublishableKey() {
    const result = await fetchAPI('/stripe/publishable-key');
    return result.publishableKey;
  },

  async getProductsWithPrices() {
    const result = await fetchAPI('/products-with-prices');
    return result.data;
  },

  async createCheckoutSession(priceId: string, metadata?: { clubId?: string; email?: string }) {
    const result = await fetchAPI('/checkout', {
      method: 'POST',
      body: JSON.stringify({
        priceId,
        clubId: metadata?.clubId,
        email: metadata?.email,
      }),
    });
    return result.url;
  },

  async createCustomerPortal(customerId: string) {
    const result = await fetchAPI('/customer-portal', {
      method: 'POST',
      body: JSON.stringify({ customerId }),
    });
    return result.url;
  },
};

export const healthAPI = {
  async check() {
    return fetchAPI('/health');
  },
};
