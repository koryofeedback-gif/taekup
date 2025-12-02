import { sql } from 'drizzle-orm';
import { db } from './db';

export class Storage {
  private stripeSchemaAvailable: boolean | null = null;

  private async checkStripeSchema(): Promise<boolean> {
    if (this.stripeSchemaAvailable !== null) {
      return this.stripeSchemaAvailable;
    }
    
    try {
      await db.execute(sql`SELECT 1 FROM stripe.products LIMIT 1`);
      this.stripeSchemaAvailable = true;
    } catch (error) {
      this.stripeSchemaAvailable = false;
    }
    
    return this.stripeSchemaAvailable;
  }

  async getProduct(productId: string) {
    if (!(await this.checkStripeSchema())) {
      return null;
    }
    
    const result = await db.execute(
      sql`SELECT * FROM stripe.products WHERE id = ${productId}`
    );
    return result[0] || null;
  }

  async listProducts(active = true, limit = 20, offset = 0) {
    if (!(await this.checkStripeSchema())) {
      return [];
    }
    
    const result = await db.execute(
      sql`SELECT * FROM stripe.products WHERE active = ${active} LIMIT ${limit} OFFSET ${offset}`
    );
    return result;
  }

  async listProductsWithPrices(active = true, limit = 20, offset = 0) {
    if (!(await this.checkStripeSchema())) {
      return [];
    }
    
    const result = await db.execute(
      sql`
        WITH paginated_products AS (
          SELECT id, name, description, metadata, active
          FROM stripe.products
          WHERE active = ${active}
          ORDER BY id
          LIMIT ${limit} OFFSET ${offset}
        )
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          p.active as product_active,
          p.metadata as product_metadata,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring,
          pr.active as price_active,
          pr.metadata as price_metadata
        FROM paginated_products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        ORDER BY p.id, pr.unit_amount
      `
    );
    return result;
  }

  async getPrice(priceId: string) {
    if (!(await this.checkStripeSchema())) {
      return null;
    }
    
    const result = await db.execute(
      sql`SELECT * FROM stripe.prices WHERE id = ${priceId}`
    );
    return result[0] || null;
  }

  async listPrices(active = true, limit = 20, offset = 0) {
    if (!(await this.checkStripeSchema())) {
      return [];
    }
    
    const result = await db.execute(
      sql`SELECT * FROM stripe.prices WHERE active = ${active} LIMIT ${limit} OFFSET ${offset}`
    );
    return result;
  }

  async getPricesForProduct(productId: string) {
    if (!(await this.checkStripeSchema())) {
      return [];
    }
    
    const result = await db.execute(
      sql`SELECT * FROM stripe.prices WHERE product = ${productId} AND active = true`
    );
    return result;
  }

  async getSubscription(subscriptionId: string) {
    if (!(await this.checkStripeSchema())) {
      return null;
    }
    
    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`
    );
    return result[0] || null;
  }
}

export const storage = new Storage();
