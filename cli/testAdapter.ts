import * as path from 'path'
import { Adapter, BaseAdapter, ChainBlocks } from '../adapters/types';
import { checkArguments, ERROR_STRING, formatTimestampAsDate, printVolumes, upperCaseFirst } from './utils';
import { getUniqStartOfTodayTimestamp } from '../helpers/getUniSubgraphVolume';
import runAdapter from '../adapters/utils/runAdapter'
import { canGetBlock, getBlock } from '../helpers/getBlock';
import allSettled from 'promise.allsettled';
import getChainsFromDexAdapter from '../adapters/utils/getChainsFromDexAdapter';
require('dotenv').config()

// tmp
const handleError = (e) => console.error(e)

// Add handler to rejections/exceptions
process.on('unhandledRejection', handleError)
process.on('uncaughtException', handleError)

// Check if all arguments are present
checkArguments(process.argv)

enum AdapterType {
  FEES = 'fees',
  VOLUME = 'volume'
}

const getFolderByAdapterType = (adapterType: AdapterType) => adapterType === AdapterType.VOLUME ? 'volumes' : adapterType

// Get path of module import
const adapterType: AdapterType = process.argv[2] as AdapterType
const passedFile = path.resolve(process.cwd(), `./${getFolderByAdapterType(adapterType)}/${process.argv[3]}`);
(async () => {
  try {
    const cleanDayTimestamp = process.argv[4] ? getUniqStartOfTodayTimestamp(new Date(+process.argv[4] * 1000)) : getUniqStartOfTodayTimestamp(new Date())
    console.info(`🦙 Running ${process.argv[3].toUpperCase()} adapter 🦙`)
    console.info(`_______________________________________`)
    // Import module to test
    let module: Adapter = (await import(passedFile)).default
    console.info(`${upperCaseFirst(adapterType)} for ${formatTimestampAsDate(String(cleanDayTimestamp))}`)
    console.info(`_______________________________________\n`)

    // Get closest block to clean day. Only for EVM compatible ones.
    const allChains = getChainsFromDexAdapter(module).filter(canGetBlock)

    const chainBlocks: ChainBlocks = {};
    await allSettled(
      allChains.map(async (chain) => {
        try {
          const latestBlock = await getBlock(cleanDayTimestamp, chain, chainBlocks).catch((e: any) => console.error(`${e.message}; ${cleanDayTimestamp}, ${chain}`))
          if (latestBlock)
            chainBlocks[chain] = latestBlock
        } catch (e) { console.log(e) }
      })
    );

    if ("adapter" in module) {
      const adapter = module.adapter
      // Get adapter
      const volumes = await runAdapter(adapter, cleanDayTimestamp, {})
      printVolumes(volumes)
      console.info("\n")
    } else if ("breakdown" in module) {
      const breakdownAdapter = module.breakdown
      const allVolumes = await Promise.all(Object.entries(breakdownAdapter).map(async ([version, adapter]) =>
        await runAdapter(adapter, cleanDayTimestamp, {}).then(res => ({ version, res }))
      ))
      allVolumes.forEach((promise) => {
        console.info("Version ->", promise.version.toUpperCase())
        console.info("---------")
        printVolumes(promise.res)
      })
    } else throw new Error("No compatible adapter found")
  } catch (error) {
    console.error(ERROR_STRING)
    console.error(error)
  }
})()