/* eslint-disable @typescript-eslint/no-require-imports -- Local database regression fixture. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function testRegistryTotalPromo(db) {
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261010_registry_total_product_promo.sql'),'utf8'));
  const registry='01010101-0101-4101-8101-010101010101';
  const first='02020202-0202-4202-8202-020202020202';
  const second='03030303-0303-4303-8303-030303030303';
  const owner='11111111-1111-4111-8111-111111111111';
  await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
  await db.query("insert into registries(id,user_id,status) values($1,$2,'active')",[registry,owner]);
  await db.query("insert into registry_items(id,registry_id,product_id,requested_quantity,unit_price_snapshot) values($1,$3,1,2,100),($2,$3,1,1,300)",[first,second,registry]);
  await db.exec("insert into store_promos(code,percentage,applies_to_registry) values('REGISTRY10',10,true),('REGISTRYCAP',20,true); update store_promos set maximum_discount_amount=10000 where code='REGISTRYCAP'");
  const apply=async(code,actor=owner)=>(await db.query('select set_registry_product_promo($1,$2,$3) as promo',[registry,actor,code])).rows[0].promo;
  await assert.rejects(apply('REGISTRY10','88888888-8888-4888-8888-888888888888'),/cannot access|Only the registry owner/);
  let result=await apply('REGISTRY10');
  assert.equal(result.subtotal,500000); assert.equal(result.discount,50000); assert.equal(result.total,450000);
  // Reapplication replaces one code rather than compounding the discount.
  assert.equal((await apply('REGISTRY10')).total,450000);
  assert.equal((await apply('REGISTRYCAP')).total,490000);
  await apply('');
  assert.equal(Number((await db.query('select unit_price_snapshot from registry_items where id=$1',[first])).rows[0].unit_price_snapshot),100);
  await apply('REGISTRY10');
  await assert.rejects(db.query('update registry_items set requested_quantity=3 where id=$1',[first]),/fixed while a promo/);
  await db.exec("select set_config('request.jwt.claim.role','authenticated',false)");
  await assert.rejects(db.query("update registries set product_promo_discount=999999 where id=$1",[registry]),/promo controls/);
  await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
  await assert.rejects(db.query("select create_registry_checkout_with_promo($1,'Giver','gift@example.test','123',null,'[]',100,'stack','REGISTRY10')",[registry]),/applied by the owner/);
  await db.exec("update store_promos set ends_at=now()-interval '1 second' where code='REGISTRY10'");
  await assert.rejects(db.query("select create_registry_checkout($1,'Giver','gift@example.test','123',null,'[]',90000,'expired-registry-gift')",[registry]),/outside its valid dates/);
  await db.exec("update store_promos set ends_at=null where code='REGISTRY10'");
  await db.query("select create_registry_checkout($1,'Giver','gift@example.test','123',null,'[]',90000,'registry-total-cash')",[registry]);
  await assert.rejects(apply(''),/gifting has started/); // A live payment also holds the snapshot.
  await db.query("select complete_registry_checkout_payment('registry-total-cash',9000000,null)");
  await db.query("select allocate_registry_cash_balance($1,$2,'04040404-0404-4404-8404-040404040404',$3)",[registry,owner,JSON.stringify([{registry_item_id:first,amount:'90000'}])]);
  await db.exec("update store_promos set is_active=false where code='REGISTRY10'");
  const checkout=(await db.query("select create_registry_checkout_with_promo($1,'Giver','gift@example.test','123',null,$2,360000,'registry-total-direct',null) as checkout",[registry,JSON.stringify([{registry_item_id:first,quantity:1},{registry_item_id:second,quantity:1}])])).rows[0].checkout;
  assert.equal(checkout.amount_kobo,36000000);
  await db.query("select complete_registry_checkout_payment('registry-total-direct',36000000,null)");
  assert.equal(Number((await db.query('select sum(funded_amount) as total from registry_items where registry_id=$1',[registry])).rows[0].total),450000);
  assert.equal(Number((await db.query('select sum(purchased_quantity) as total from registry_items where registry_id=$1',[registry])).rows[0].total),3);
  await assert.rejects(apply('REGISTRYCAP'),/gifting has started/);
  await assert.rejects(db.query("select get_registry_delivery_quote($1,$2,'lagos_01','FREE')",[registry,owner]),/Only one promo/);
  await db.query("select get_registry_delivery_quote($1,$2,'lagos_01',null)",[registry,owner]);
  await db.query('select delete_unfunded_registry($1)',[registry]);
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261010_registry_total_product_promo.sql'),'utf8'));
  console.log('Registry-wide discounts, replacement, caps, cash allocation, direct funding, locked snapshots, no stacked codes and hard deletion passed.');
};
