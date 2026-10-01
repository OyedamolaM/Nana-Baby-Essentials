/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS regression runner. */
// Install the disposable test database with:
// npm install --prefix .tmp/variant-validation --no-save --package-lock=false @electric-sql/pglite
const { PGlite } = require("../.tmp/variant-validation/node_modules/@electric-sql/pglite");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth;
      create role anon; create role authenticated; create role service_role;
      create function auth.uid() returns uuid language sql as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
      create function auth.role() returns text language sql as $$ select 'authenticated'::text $$;
      create table products (id bigint primary key, name text, has_variants boolean default false, in_stock boolean default true, stock_quantity integer default 0 check (stock_quantity >= 0), product_kind text default 'standard', selling_price numeric, price numeric);
      create table product_variants (id uuid primary key, product_id bigint references products, size text, color text, options jsonb default '{}', in_stock boolean default true, stock_quantity integer default 0 check (stock_quantity >= 0), price_override numeric);
      create table product_images (id uuid primary key default gen_random_uuid(), product_id bigint references products, variant_id uuid references product_variants, sort_order integer default 0, is_variant_only boolean default false, is_primary boolean default false, url text);
      create table user_profiles (id uuid primary key, deleted_at timestamptz, account_status text, phone text, full_name text, email text);
      create table shipping_tiers (code text, label text, fee numeric, is_active boolean);
      create table orders (id uuid primary key default gen_random_uuid(), user_id uuid, status text, payment_reference text, items jsonb, payment_method text, total numeric, shipping_address jsonb, billing_address jsonb, shipping_tier text, customer_name text, customer_email text, customer_phone text);
      insert into user_profiles (id,phone,full_name,email) values (auth.uid(),'123','Customer','customer@example.test');
      insert into shipping_tiers values ('lagos_01','Lagos delivery',100,true);
      insert into products(id,name,price,stock_quantity,product_kind) values (1,'Toy',10,0,'standard'), (2,'Gift Bundle',20,3,'special_package'), (3,'Swoop Package',30,2,'special_package');
    `);
    for (const name of ["20261002_colour_galleries_and_explicit_stock_limits.sql", "20261003_promos_and_package_purchase_limits.sql"]) {
      await db.exec(fs.readFileSync(path.join(__dirname, "../supabase/migrations", name), "utf8"));
    }
    await db.exec(`insert into store_promos(code,percentage,is_active,starts_at,ends_at) values
      ('WELCOME10',10,true,null,null), ('OFF',20,false,null,null),
      ('FUTURE',15,true,now()+interval '1 day',null), ('EXPIRED',10,true,null,now()-interval '1 second'),
      ('LIVE',12.5,true,now()-interval '1 day',now()+interval '1 day');`);
    const promo = async (code, subtotal = 10000) => (await db.query("select get_store_promo_discount($1,$2) as promo", [code, subtotal])).rows[0].promo;
    assert.equal((await promo(" welcome10 ")).discount_amount, 1000);
    assert.equal((await promo("LIVE", 101.01)).discount_amount, 12.63);
    for (const code of ["OFF", "FUTURE", "EXPIRED", "MISSING"]) await assert.rejects(promo(code), /invalid, inactive/);
    await assert.rejects(promo("WELCOME10", -1), /Invalid subtotal/);
    await assert.rejects(db.exec("insert into store_promos(code,percentage) values ('BAD',100)"), /check constraint/);
    await assert.rejects(db.exec("insert into store_promos(code,percentage,starts_at,ends_at) values ('DATES',10,now(),now()-interval '1 day')"), /check constraint/);
    const create = async (items, code) => (await db.query("select create_store_order('{}','{}',$1::jsonb,'lagos_01',$2) as id", [JSON.stringify(items), code])).rows[0].id;
    const orderId = await create([{ product_id: 1, quantity: 2, price: 1, discount: 99999 }], "welcome10");
    const order = (await db.query("select * from orders where id=$1", [orderId])).rows[0];
    assert.equal(Number(order.total), 18100); // 20,000 subtotal - 2,000 discount + 100 shipping.
    assert.equal(Number(order.discount_amount), 2000);
    assert.equal(order.promo_code, "WELCOME10");
    assert.equal(order.shipping_label, "Lagos delivery");
    assert.equal(order.items[0].price, 10000); // Client price ignored.
    await assert.rejects(create([{ product_id: 1, quantity: 1 }], "EXPIRED"), /invalid, inactive/);
    const legacy = (await db.query("select create_store_order('{}','{}','[{\"product_id\":1,\"quantity\":1}]','lagos_01') as id")).rows[0].id;
    assert.equal(Number((await db.query("select total from orders where id=$1", [legacy])).rows[0].total), 10100);
    const bundle = await create([{ product_id: 2, quantity: 3 }], "WELCOME10");
    await db.query("select complete_store_order_payment($1,'bundle-ref')", [bundle]);
    assert.equal((await db.query("select stock_quantity from products where id=2")).rows[0].stock_quantity, 0);
    await assert.rejects(create([{ product_id: 2, quantity: 1 }], null), /only has 0 left/);
    await db.exec("update products set stock_limited=false where id=2");
    await create([{ product_id: 2, quantity: 25 }], null);
    await assert.rejects(create([{ product_id: 3, quantity: 3 }], null), /only has 2 left/);
    await create([{ product_id: 3, quantity: 2 }], "LIVE");
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from store_promos"), /permission denied/);
    await promo("WELCOME10"); // Known-code validation works without exposing the promo table.
    await db.exec("reset role");
    await db.exec(fs.readFileSync(path.join(__dirname, "../supabase/migrations/20261003_promos_and_package_purchase_limits.sql"), "utf8"));
    assert.equal((await promo("WELCOME10")).percentage, 10);
    console.log("Promo checkout, date validation, access control and package purchase limits passed.");
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
