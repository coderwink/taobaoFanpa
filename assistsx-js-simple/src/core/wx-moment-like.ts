import { NodeClassValue, Step } from "assistsx-js";
import { log, clearLogs } from "../logging/app-log";
import { wechatEnter } from "./wechat-enter";

class WxMomentLike {
    pageCount = 0;
    pageIndex = 0;

    start = async (): Promise<void> => {
        clearLogs()
        try {
            await Step.run(wechatEnter.launchWechat, { data: { MOMENT_LIKE: true } })
            log('执行结束')
        } catch (error) {
            log('执行失败：' + error)
        }
    };
    private enterMoment = async (step: Step): Promise<Step | undefined> => {

        const result = step.findById("com.tencent.mm:id/m7k")[0].click();
        if (result) {
            log('点击"朋友圈"')
        } else {
            log('点击"朋友圈"失败')
        }
        this.pageIndex = 0;
        this.pageCount = 0;
        return step.next(this.clickLikeMoment)
    };

    switchDiscover = async (step: Step): Promise<Step | undefined> => {
        const packageName = step.getPackageName();
        if (packageName !== wechatEnter.wechatPackageName) {
            log('WX打开失败')
            return undefined
        }

        const bottomBarNode = step.findByTags(NodeClassValue.RelativeLayout, { filterViewId: "com.tencent.mm:id/huj" })[0];
        if (!bottomBarNode) {
            log('WX底部栏未找到，尝试返回重试')
            step.back();
            return step.repeat()
        }

        const meNode = bottomBarNode.findByTags(NodeClassValue.TextView, { filterText: "发现", filterViewId: "com.tencent.mm:id/icon_tv", })[0];
        const result = meNode.findFirstParentClickable().click();
        if (result) {
            log('点击"发现"')
            return step.next(this.enterMoment)
        } else {
            log('点击"发现"失败')
        }
        return step.repeat()
    };

    clickLike = async (step: Step): Promise<Step | undefined> => {

        const result = (await step.async.findById('com.tencent.mm:id/qd', { filterClass: 'android.widget.LinearLayout' }))[0]?.click();
        if (result) {
            log('点击"点赞"')
            return step.next(this.clickLikeMoment, { delayMs: 2000 })
        } else {
            log('点击"点赞"失败')
        }

        return step.repeat()
    }
    clickLikeMoment = async (step: Step): Promise<Step | undefined> => {
        const listNode = step.findById("com.tencent.mm:id/hbs")[0]

        const children = listNode?.getChildren()

        for (let i = 0; i < children.length; i++) {
            const child = children[i]
            if (child.className === NodeClassValue.LinearLayout && i >= this.pageIndex) {
                const nicknameNode = child.findById("com.tencent.mm:id/kbq")[0]

                const nickname = nicknameNode.text
                log("昵称：" + nickname)

                const nodes = child.getNodes()
                let text: string = ""
                for (let j = 0; j < nodes.length; j++) {
                    const node = nodes[j]
                    if (node.className == NodeClassValue.TextView) {
                        text = text + "\n" + node.text
                    }
                }
                log(text.trim() || "(no text)");

                const result = (await child.async.findById('com.tencent.mm:id/r2', { filterDes: '评论' }))
                    ?.find(node => node.bounds.isInScreen())
                    ?.click();
                if (result) {
                    log('点击"评论"')
                    this.pageIndex = i + 1;
                    return step.next(this.clickLike)
                } else {
                    log('点击"评论"失败')
                }
                this.pageIndex = i + 1;
            }
        }
        if (this.pageCount >= 3) {
            log('结束朋友圈点赞')
            return undefined
        }
        const result = listNode.scrollForward()
        if (result) {
            log('翻页')
            this.pageIndex = 0;
            this.pageCount++;
        } else {
            log('列表已滚动到底部')
        }
        return step.repeat()
    };
}

export const wxMomentLike = new WxMomentLike()
