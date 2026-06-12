import { AssistsX, AssistsXAsync, Step } from 'assistsx-js'
import {
  STORAGE_KEY_UNFOLLOW_ACCOUNTS,
  log,
  clearLogs,
} from '@/logging/app-log'
import { wechatCollectAccountInfo } from '@/core/wechat-collect-account-info'
import { wechatCollectMoment } from '@/core/wechat-collect-moment'
import { wechatCollectOfficialAccount } from '@/core/wechat-collect-official-account'
import { wechatUnfollowOfficialAccount } from '@/core/wechat-unfollow-official-account'
import { wxMomentLike } from '@/core/wx-moment-like'
import { taobaoLongScreenshotTask } from '@/core/taobao-long-screenshot'
import { swiperScreenshotTask } from '@/core/swiper-screenshot'
import { simpleSwiperTask } from '@/core/simple-swiper'
import { taobaoMemberCollector } from '@/core/taobao-member-collector'
import { accessibilityTreeProbe } from '@/core/accessibility-tree-probe'
import { accessibilitySwiperTask } from '@/core/accessibility-swiper'
import { taobaoFlashSaleCollector } from '@/core/taobao-flash-sale-collector'

/** 日志页 URL query ?task= 取值 */
export const TASK_IDS = [
  'accountInfo',
  'collectMoment',
  'momentLike',
  'collectOfficial',
  'unfollow',
  'taobaoLongScreenshot',
  'swiperScreenshot',
  'simpleSwiper',
  'taobaoMemberCollect',
  'treeProbe',
  'a11ySwiper',
  'flashSaleCollect',
  'test',
] as const

export type TaskId = (typeof TASK_IDS)[number]

export function isKnownTask(task: string | undefined): task is TaskId {
  return TASK_IDS.includes(task as TaskId)
}

/**
 * 根据日志页传入的 task 启动对应自动化（浮窗实例内调用）
 */
export async function runTaskByQuery(task: string | undefined, storeName?: string): Promise<void> {
  if (!task || !task.trim()) {
    return
  }

  switch (task as TaskId) {
    case 'accountInfo':
      wechatCollectAccountInfo.start()
      break
    case 'collectMoment':
      wechatCollectMoment.start()
      break
    case 'momentLike':
      wxMomentLike.start()
      break
    case 'collectOfficial':
      wechatCollectOfficialAccount.start()
      break
    case 'taobaoLongScreenshot':
      taobaoLongScreenshotTask.start()
      break
    case 'swiperScreenshot':
      swiperScreenshotTask.start()
      break
    case 'simpleSwiper':
      simpleSwiperTask.start()
      break
    case 'taobaoMemberCollect': {
      // 从 sessionStorage 读取店铺名称
      const storeName = sessionStorage.getItem('memberCollectStoreName')
      if (storeName) {
        taobaoMemberCollector.setStoreName(storeName)
      }
      taobaoMemberCollector.start()
      break
    }
    case 'treeProbe':
      accessibilityTreeProbe.start()
      break
    case 'a11ySwiper':
      accessibilitySwiperTask.start()
      break
    case 'flashSaleCollect': {
      if (storeName) {
        taobaoFlashSaleCollector.setStoreName(storeName)
      }
      taobaoFlashSaleCollector.start()
      break
    }
    case 'unfollow': {
      let accounts: string[] = []
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY_UNFOLLOW_ACCOUNTS)
        if (raw) {
          const parsed = JSON.parse(raw) as unknown
          if (Array.isArray(parsed)) {
            accounts = parsed.filter((x): x is string => typeof x === 'string')
          }
        }
      } catch {
        accounts = []
      }
      sessionStorage.removeItem(STORAGE_KEY_UNFOLLOW_ACCOUNTS)
      wechatUnfollowOfficialAccount.start(accounts)
      break
    }
    case 'test':
      await clearLogs();
      AssistsXAsync.launchApp('com.tencent.mm');
      //延迟1秒钟
      await Promise.resolve(new Promise(resolve => setTimeout(resolve, 2000)));
      (await AssistsXAsync.getAllNodes()).forEach(node => {
        console.log(node)
      })
      break
    default:
      log(`Unknown task: ${task}`)
  }
}
