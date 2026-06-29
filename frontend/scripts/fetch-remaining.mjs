// Fetch only TIAUSDT and SHIBUSDT (remaining coins)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir  = dirname(fileURLToPath(import.meta.url))
const envRaw = readFileSync(join(__dir, '../../.env'), 'utf8')
const env    = Object.fromEntries(
  envRaw.split('\n').filter(l=>l.includes('=')&&!l.startsWith('#'))
  .map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]})
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})

const BINANCE='https://data-api.binance.vision', SIX_MONTHS=6*30*24*60*60*1000, LIMIT=500, DELAY_MS=300
const COINS=['TIAUSDT','SHIBUSDT']
const sleep=ms=>new Promise(r=>setTimeout(r,ms))

async function fetchCoin(coin,startTime,endTime){
  let from=startTime,total=0
  // Delete existing partial rows first
  await supabase.from('historical_15m_portfolio_data').delete().eq('coin',coin)
  while(from<endTime){
    const url=`${BINANCE}/api/v3/klines?symbol=${coin}&interval=15m&startTime=${from}&limit=${LIMIT}`
    let raw
    for(let a=0;a<3;a++){
      try{
        const res=await fetch(url,{cache:'no-store'})
        if(res.status===429){await sleep(65000);continue}
        if(!res.ok){process.stdout.write(` [${res.status}]`);break}
        raw=await res.json();break
      }catch(e){await sleep(2000)}
    }
    if(!raw?.length)break
    const rows=raw.map(k=>({coin,ts:new Date(k[0]).toISOString(),open:parseFloat(k[1]),high:parseFloat(k[2]),low:parseFloat(k[3]),close:parseFloat(k[4]),volume:parseFloat(k[5])}))
    for(let b=0;b<rows.length;b+=500){
      const {error}=await supabase.from('historical_15m_portfolio_data').upsert(rows.slice(b,b+500),{onConflict:'coin,ts',ignoreDuplicates:true})
      if(error)process.stdout.write(` [err:${error.message.slice(0,20)}]`)
    }
    total+=rows.length
    const lastTs=raw[raw.length-1][0]
    process.stdout.write(` ${Math.min(99,Math.round((lastTs-startTime)/SIX_MONTHS*100))}%`)
    if(raw.length<LIMIT||lastTs>=endTime)break
    from=lastTs+1;await sleep(DELAY_MS)
  }
  return total
}

async function main(){
  const endTime=Date.now(),startTime=endTime-SIX_MONTHS
  for(const coin of COINS){
    process.stdout.write(`  ${coin.padEnd(10)}`)
    const n=await fetchCoin(coin,startTime,endTime)
    process.stdout.write(`  ✓ ${n.toLocaleString()} rows\n`)
  }
  console.log('\n✅ Remaining coins fetched.')
}
main().catch(console.error)
