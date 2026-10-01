/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS regression runner. */
// Install the disposable test database with:
// npm install --prefix .tmp/variant-validation --no-save --package-lock=false @electric-sql/pglite
const { PGlite } = require("../.tmp/variant-validation/node_modules/@electric-sql/pglite");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");
const promoExports = {};
new Function("exports", ts.transpileModule(fs.readFileSync(path.join(__dirname, "../lib/promos.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(promoExports);

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth;
      create role anon; create role authenticated; create role service_role;
      create function auth.uid() returns uuid language sql as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
      create function auth.role() returns text language sql as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated') $$;
      create table products (id bigint primary key, name text, has_variants boolean default false, in_stock boolean default true, stock_quantity integer default 0 check (stock_quantity >= 0), product_kind text default 'standard', selling_price numeric, price numeric);
      create table product_variants (id uuid primary key, product_id bigint references products, size text, color text, options jsonb default '{}', in_stock boolean default true, stock_quantity integer default 0 check (stock_quantity >= 0), price_override numeric);
      create table product_images (id uuid primary key default gen_random_uuid(), product_id bigint references products, variant_id uuid references product_variants, sort_order integer default 0, is_variant_only boolean default false, is_primary boolean default false, url text);
      create table user_profiles (id uuid primary key, deleted_at timestamptz, account_status text, phone text, full_name text, email text);
      create table shipping_tiers (code text, label text, fee numeric, is_active boolean);
      create table orders (id uuid primary key default gen_random_uuid(), user_id uuid, status text, payment_reference text, items jsonb, payment_method text, total numeric, shipping_address jsonb, billing_address jsonb, shipping_tier text, customer_name text, customer_email text, customer_phone text);
      alter table user_profiles add column shipping_address jsonb;
      create table registries (id uuid primary key, user_id uuid, status text);
      create table registry_items (id uuid primary key, registry_id uuid, product_id bigint, requested_quantity integer, purchased_quantity integer default 0, unit_price_snapshot numeric, funded_amount numeric default 0);
      create table registry_orders (id uuid primary key default gen_random_uuid(), registry_id uuid, buyer_name text, buyer_email text, buyer_phone text, buyer_message text, total_amount numeric, contribution_type text, status text, paystack_reference text, shipping_address jsonb, paid_at timestamptz, paystack_transaction_id bigint);
      create table registry_order_items (id uuid primary key default gen_random_uuid(), registry_order_id uuid, registry_item_id uuid, product_id bigint, quantity integer, amount numeric);
      create table registry_contributions (id uuid primary key default gen_random_uuid(), registry_id uuid, buyer_name text, buyer_email text, buyer_phone text, buyer_message text, amount numeric, status text, paystack_reference text, paid_at timestamptz, paystack_transaction_id bigint);
      insert into user_profiles (id,phone,full_name,email) values (auth.uid(),'123','Customer','customer@example.test');
      insert into shipping_tiers values ('lagos_01','Lagos delivery',100,true);
      insert into products(id,name,price,stock_quantity,product_kind) values (1,'Toy',10,0,'standard'), (2,'Gift Bundle',20,3,'special_package'), (3,'Swoop Package',30,2,'special_package');
      alter table user_profiles add column is_admin boolean default false;
      alter table shipping_tiers add column fulfillment_type text default 'delivery';
      alter table shipping_tiers add column sort_order integer default 0;
      alter table registries add column fulfillment_status text default 'collecting';
      alter table registries add column closed_at timestamptz;
      alter table registries add column closed_note text;
      alter table registries add column ready_for_shipping_at timestamptz;
      alter table registries add column fulfillment_updated_at timestamptz;
      alter table registries add column fulfillment_updated_by uuid;
      create function rebuild_registry_item_funding(p_registry_id uuid) returns void language plpgsql as $$ begin return; end; $$;
    `);
    for (const name of ["20260510_registry_partial_checkout_payments.sql", "20260805_registry_shipping_address_security.sql", "20261002_colour_galleries_and_explicit_stock_limits.sql", "20261003_promos_and_package_purchase_limits.sql", "20261004_promo_minimum_purchase_amount.sql", "20261005_promo_delivery_caps_and_registry.sql", "20261006_registry_gift_balance.sql", "20261007_registry_delivery_checkout.sql", "20261008_registry_deletion.sql"]) {
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
    await assert.rejects(promo("WELCOME10", -1), /Invalid checkout amount/);
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
    await db.exec("insert into store_promos(code,percentage,minimum_purchase_amount) values ('BIGSHOP',10,500000), ('OTHERMIN',15,250000)");
    await assert.rejects(promo("BIGSHOP", 499999.99), /requires at least NGN 500,000.00/);
    assert.equal((await promo("BIGSHOP", 500000)).discount_amount, 50000);
    assert.equal((await promo("BIGSHOP", 600000)).discount_amount, 60000);
    assert.equal((await promo("OTHERMIN", 250000)).discount_amount, 37500);
    assert.equal((await promo("WELCOME10", 1)).discount_amount, 0.1); // Existing promos retain no minimum.
    await assert.rejects(create([{ product_id: 1, quantity: 49, price: 9999999 }], "BIGSHOP"), /requires at least/); // Client prices cannot satisfy a minimum.
    await assert.rejects(create([{ product_id: 1, quantity: 1 }], "BIGSHOP"), /requires at least/);
    await db.exec("update shipping_tiers set fee=500000 where code='lagos_01'");
    await assert.rejects(create([{ product_id: 1, quantity: 49 }], "BIGSHOP"), /requires at least/); // Delivery cannot satisfy a minimum.
    await db.exec("update shipping_tiers set fee=100 where code='lagos_01'");
    const thresholdOrderId = await create([{ product_id: 1, quantity: 50 }], "BIGSHOP");
    const thresholdOrder = (await db.query("select * from orders where id=$1", [thresholdOrderId])).rows[0];
    assert.equal(Number(thresholdOrder.total), 450100);
    assert.equal(Number(thresholdOrder.discount_amount), 50000);
    assert.equal(thresholdOrder.promo_code, "BIGSHOP");
    await db.query("select complete_store_order_payment($1,'threshold-ref')", [thresholdOrderId]);
    await db.query("select complete_store_order_payment($1,'threshold-ref')", [thresholdOrderId]);
    const paidThresholdOrder = (await db.query("select status,total,discount_amount from orders where id=$1", [thresholdOrderId])).rows[0];
    assert.equal(paidThresholdOrder.status, "paid");
    assert.equal(Number(paidThresholdOrder.total), 450100);
    assert.equal(Number(paidThresholdOrder.discount_amount), 50000);
    await assert.rejects(db.exec("insert into store_promos(code,percentage,minimum_purchase_amount) values ('NEGATIVE',10,-1)"), /check constraint/);
    await assert.rejects(db.exec("insert into store_promos(code,percentage,minimum_purchase_amount) values ('NOTNUMBER',10,'NaN')"), /check constraint/);
    await db.exec(`insert into store_promos(code,percentage,promo_type,maximum_discount_amount,applies_to_store,applies_to_registry) values
      ('CAPPED',10,'products',25000,true,true), ('FREE',10,'free_delivery',null,true,false),
      ('FREECAP',10,'free_delivery',40,true,false), ('SHIP50',50,'delivery_discount',null,true,false),
      ('REGONLY',10,'products',null,false,true)`);
    const preview = async (code, subtotal, shipping, context = 'store') => (await db.query("select get_checkout_promo_discount($1,$2,$3,$4) as promo", [code,subtotal,shipping,context])).rows[0].promo;
    assert.equal((await preview('CAPPED',500000,100)).discount_amount,25000);
    assert.equal((await preview('FREE',10000,100)).discount_amount,100);
    assert.equal((await preview('FREECAP',10000,100)).discount_amount,40);
    assert.equal((await preview('SHIP50',10000,100)).discount_amount,50);
    await assert.rejects(preview('FREE',10000,0),/delivery fee/);
    await assert.rejects(preview('REGONLY',10000,0),/not enabled/);
    await assert.rejects(preview('WELCOME10',10000,0,'registry'),/not enabled/);
    for (const [code,quantity,total,discount] of [['CAPPED',50,475100,25000],['FREE',1,10000,100],['FREECAP',1,10060,40],['SHIP50',1,10050,50]]) {
      const id = await create([{ product_id:1,quantity }],code);
      const saved = (await db.query('select * from orders where id=$1',[id])).rows[0];
      assert.equal(Number(saved.total),total);
      assert.equal(Number(saved.discount_amount),discount);
      assert.equal(promoExports.calculatePromoDiscount({ promoType:saved.promo_type, percentage:Number(saved.discount_percentage), maximumDiscountAmount:saved.maximum_discount_amount === null ? null : Number(saved.maximum_discount_amount) },saved.items.reduce((sum,item)=>sum+item.price*item.quantity,0),100),discount); // Admin and database calculations agree.
      assert.equal(Number(saved.total)+Number(saved.discount_amount)-saved.items.reduce((sum,item)=>sum+item.price*item.quantity,0),100); // Receipt reconstructs original delivery fee correctly.
      await db.query("select complete_store_order_payment($1,$2)",[id,`${code}-ref`]);
    }
    await db.exec("update store_promos set applies_to_registry=true where code='WELCOME10'");
    await db.exec(`update user_profiles set shipping_address='{"name":"Owner","phone":"123","address":"Street","city":"Lagos","state":"Lagos"}';
      insert into registries(id,user_id,status) values ('22222222-2222-4222-8222-222222222222',auth.uid(),'active');
      insert into registry_items(id,registry_id,product_id,requested_quantity,unit_price_snapshot) values
      ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',1,1,500),
      ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222',1,1,500);`);
    const registryCreate = async (item,amount,code,reference) => (await db.query("select create_registry_checkout_with_promo('22222222-2222-4222-8222-222222222222','Buyer','buyer@example.test','123',null,$1,$2,$3,$4) as checkout",[JSON.stringify(item ? [{registry_item_id:item,quantity:1}] : []),amount,reference,code])).rows[0].checkout;
    await assert.rejects(registryCreate('33333333-3333-4333-8333-333333333333',500000,'CAPPED','guest'),/started by the server/);
    await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
    const fullGift = await registryCreate('33333333-3333-4333-8333-333333333333',500000,'CAPPED','registry-full');
    assert.equal(Number(fullGift.amount_kobo),47500000);
    const fullSnapshot = (await db.query('select * from registry_orders where id=$1',[fullGift.registry_order_id])).rows[0];
    assert.equal(Number(fullSnapshot.discount_amount),25000);
    assert.equal(fullSnapshot.promo_code,'CAPPED');
    await assert.rejects(db.query("select complete_registry_checkout_payment('registry-full',50000000,null)"),/does not match/);
    await db.exec("delete from store_promos where code='CAPPED'"); // Existing payments retain their snapshot after deletion.
    await assert.rejects(preview('CAPPED',500000,100),/invalid, inactive/);
    await db.query("select complete_registry_checkout_payment('registry-full',47500000,null)");
    await db.query("select complete_registry_checkout_payment('registry-full',47500000,null)");
    let funded = (await db.query("select * from registry_items where id='33333333-3333-4333-8333-333333333333'")).rows[0];
    assert.equal(Number(funded.funded_amount),500000);
    assert.equal(funded.purchased_quantity,1);
    const partialGift = await registryCreate('44444444-4444-4444-8444-444444444444',400000,'WELCOME10','registry-partial');
    assert.equal(Number(partialGift.amount_kobo),36000000);
    await registryCreate('44444444-4444-4444-8444-444444444444',500000,'WELCOME10','registry-competing');
    await db.query("select complete_registry_checkout_payment('registry-partial',36000000,null)");
    funded = (await db.query("select * from registry_items where id='44444444-4444-4444-8444-444444444444'")).rows[0];
    assert.equal(Number(funded.funded_amount),400000);
    assert.equal(funded.purchased_quantity,0);
    await assert.rejects(db.query("select complete_registry_checkout_payment('registry-competing',45000000,null)"),/remaining balance/);
    await assert.rejects(registryCreate('44444444-4444-4444-8444-444444444444',100000,'BIGSHOP','below-min'),/requires at least|not enabled/);
    await assert.rejects(registryCreate(null,10000,'WELCOME10','cash-promo'),/not cash contributions/);
    await db.exec("update store_promos set applies_to_registry=true where code='FREE'");
    await assert.rejects(registryCreate('44444444-4444-4444-8444-444444444444',100000,'FREE','delivery-registry'),/delivery fee/);
    const remainingGift = await registryCreate('44444444-4444-4444-8444-444444444444',100000,'WELCOME10','registry-rest');
    await db.query("select complete_registry_checkout_payment('registry-rest',$1,null)",[remainingGift.amount_kobo]);
    funded = (await db.query("select * from registry_items where id='44444444-4444-4444-8444-444444444444'")).rows[0];
    assert.equal(Number(funded.funded_amount),500000);
    assert.equal(funded.purchased_quantity,1);
    await db.exec("select set_config('request.jwt.claim.role','authenticated',false)");
    await require('./test-registry-balance-delivery.cjs')(db);
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
    await db.exec(fs.readFileSync(path.join(__dirname, "../supabase/migrations/20261004_promo_minimum_purchase_amount.sql"), "utf8"));
    await db.exec(fs.readFileSync(path.join(__dirname, "../supabase/migrations/20261005_promo_delivery_caps_and_registry.sql"), "utf8"));
    await db.exec(fs.readFileSync(path.join(__dirname, "../supabase/migrations/20261006_registry_gift_balance.sql"), "utf8"));
    await db.exec(fs.readFileSync(path.join(__dirname, "../supabase/migrations/20261007_registry_delivery_checkout.sql"), "utf8"));
    assert.equal((await promo("WELCOME10")).percentage, 10);
    await assert.rejects(promo("BIGSHOP", 499999.99), /requires at least/);
    console.log("Promo minimums, caps, delivery discounts, registry funding, deletion snapshots, trusted totals, payment completion, dates, access control and package purchase limits passed.");
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
