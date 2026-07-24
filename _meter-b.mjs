const EP = 'https://recipe-vault-mh.netlify.app/.netlify/functions/submit'
const EXTRACT = 'https://recipe-vault-mh.netlify.app/.netlify/functions/extract'
const KEY = 'meter-test-key'

const post = async (url, body, auth) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

console.log('--- 1. import #20 (last free slot) should SUCCEED ---')
const a = await post(EP, { url: 'https://www.budgetbytes.com/creamy-garlic-chicken/' }, KEY)
console.log('   HTTP', a.status, '| status:', a.body?.status, '| title:', a.body?.title)
console.log('   =>', a.body?.ok ? 'SAVED (correct)' : 'unexpected: ' + a.body?.message)

console.log('\n--- 2. import #21 should be BLOCKED by the cap ---')
const b = await post(EP, { url: 'https://www.budgetbytes.com/creamy-garlic-chicken/' }, KEY)
console.log('   HTTP', b.status, '| status:', b.body?.status)
console.log('   msg:', b.body?.message)
console.log('   =>', b.body?.status === 'limit_reached' ? 'BLOCKED (correct)' : 'NOT BLOCKED — problem')

console.log('\n--- 3. extract endpoint now requires sign-in ---')
const c = await post(EXTRACT, { url: 'https://www.budgetbytes.com/creamy-garlic-chicken/' })
console.log('   HTTP', c.status, '|', c.body?.error)
console.log('   =>', c.status === 401 ? 'AUTH REQUIRED (correct)' : 'STILL OPEN — problem')

console.log('\nSAVED_RECIPE_ID=' + (a.body?.recipe_id ?? ''))
