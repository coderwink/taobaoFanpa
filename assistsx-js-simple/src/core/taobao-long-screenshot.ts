import { Step, NodeClassValue, AssistsXAsync, fileIO, imageUtils } from "assistsx-js";
import { log, clearLogs } from "../logging/app-log";

class TaobaoLongScreenshotTask {
    private taobaoPackageName = 'com.taobao.taobao';
    private maxScreenshots = 10; // 最大截屏次数，防止死循环

    start = async (): Promise<void> => {
        clearLogs();
        try {
            await Step.run(this.launchTaobao);
            log('长截图任务执行结束');
        } catch (error) {
            log('长截图执行失败：' + error);
        }
    };

    private launchTaobao = async (step: Step): Promise<Step | undefined> => {
        log('正在启动淘宝...');
        step.launchApp(this.taobaoPackageName);
        // 等待App启动
        await step.delay(3000);
        return step.next(this.backToHome);
    };

    private backToHome = async (step: Step): Promise<Step | undefined> => {
        log('正在确保进入首页(点击底部最左侧按钮)...');

        await step.delay(1500);

        try {
            const screenSize = await AssistsXAsync.getScreenSize();
            const width = screenSize?.width || screenSize?.screenWidth;
            const height = screenSize?.height || screenSize?.screenHeight;

            if (width && height) {
                // 点击底部导航栏最左侧按钮（X取 10%，Y取 96% 以命中底部Tab区域）
                const clickX = Math.floor(width * 0.1);
                const clickY = Math.floor(height * 0.96);
                log(`执行全局点击: X=${clickX}, Y=${clickY}`);
                await AssistsXAsync.clickByGesture(clickX, clickY, 50);
            } else {
                log('无法获取屏幕尺寸，使用备用坐标点击左下角...');
                await AssistsXAsync.clickByGesture(100, 2200, 50);
            }
        } catch (err) {
            log('点击坐标失败：' + err);
        }

        await step.delay(2000); // 留出时间让首页加载
        return step.next(this.searchStore);
    };

    private searchStore = async (step: Step): Promise<Step | undefined> => {
        log('寻找首页顶部的”搜索”按钮...');

        await step.delay(1500);

        const searchBtns = step.findByTextAllMatch('搜索');

        if (searchBtns.length > 0) {
            log('找到“搜索”按钮，计算边界并点击其左侧的搜索框区域...');
            const btn = searchBtns[0]; // 首页顶部通常有一个明显的搜索按钮
            const bounds = await AssistsXAsync.getBoundsInScreen(btn);

            if (bounds && bounds.bottom > bounds.top) {
                // 点击按钮左侧（占据左半边屏幕的区域），Y 轴对齐
                const clickX = Math.floor(bounds.left / 2);
                const clickY = Math.floor(bounds.centerY);
                log(`在搜索框中央点击: X=${clickX}, Y=${clickY}`);
                await AssistsXAsync.clickByGesture(clickX, clickY, 50);
            } else {
                log('无法获取按钮边界，尝试盲点顶部区域...');
                const screenSize = await AssistsXAsync.getScreenSize();
                const width = screenSize?.width || screenSize?.screenWidth || 1080;
                await AssistsXAsync.clickByGesture(Math.floor(width / 2), 150, 50);
            }

            await step.delay(3000); // 留出充裕的时间让搜索页和键盘弹出

            log('输入搜索关键词: 卡诗官方旗舰店');
            await step.delay(1500);
            const editTexts = step.findByTags('android.widget.EditText');
            if (editTexts.length > 0) {
                const searchInput = editTexts[0];
                // 使用底层无感赋值，避免弹窗
                AssistsXAsync.setNodeText(searchInput, '卡诗官方旗舰店');
                await step.delay(1000);

                log('寻找并点击输入框右侧的搜索按钮...');
                const bounds = await AssistsXAsync.getBoundsInScreen(searchInput);
                const screenSize = await AssistsXAsync.getScreenSize();
                const screenWidth = screenSize?.width || screenSize?.screenWidth || 1080;

                if (bounds && bounds.centerY > 0) {
                    // 搜索按钮通常在输入框所在行的最右侧区域（取屏幕宽度 90% 处）
                    const clickX = Math.floor(screenWidth * 0.90);
                    const clickY = Math.floor(bounds.centerY);
                    log(`物理点击搜索按钮: X=${clickX}, Y=${clickY}`);
                    await step.delay(1500);
                    // 必须使用物理点击，因为通过文本找到的节点往往是不响应点击的内部 TextView
                    await AssistsXAsync.clickByGesture(clickX, clickY, 50);
                } else {
                    log('无法获取输入框边界，尝试通过文本匹配查找搜索按钮...');
                    const searchConfirmBtns = step.findByTextAllMatch('搜索');
                    for (const btn of searchConfirmBtns) {
                        const b = await AssistsXAsync.getBoundsInScreen(btn);
                        if (b && b.left > screenWidth * 0.6) {
                            await AssistsXAsync.clickByGesture(Math.floor(b.centerX), Math.floor(b.centerY), 50);
                            break;
                        }
                    }
                }
            } else {
                log('未找到明确的 EditText 节点，尝试针对搜索栏直接输入...');
                const innerSearch = step.findByTextAllMatch('搜索');
                if (innerSearch.length > 0) {
                    AssistsXAsync.setNodeText(innerSearch[0], '卡诗官方旗舰店');
                }
            }
            await step.delay(1000);
            try {
                const { ime } = await import('assistsx-js');
                await ime.performEditorAction(3); // ImeAction.SEARCH
            } catch (err) {
                // ignore
            }

            return step.next(this.enterStore);
        }

        const retryCount = (step.state.searchRetry || 0) + 1;
        step.state.searchRetry = retryCount;
        if (retryCount > 3) {
            log('多次未找到首页搜索框，可能是页面结构特殊或弹窗遮挡。');
        }

        return step.repeat({ delayMs: 2000 });
    };

    /**
     * 辅助方法：通过获取节点真实的物理边界来模拟物理点击，
     * 专门用于解决无障碍节点本身不可点击的问题
     */
    private async clickNodeByGesture(node: any): Promise<boolean> {
        const bounds = await AssistsXAsync.getBoundsInScreen(node);
        if (bounds && bounds.centerX > 0 && bounds.centerY > 0) {
            await AssistsXAsync.clickByGesture(Math.floor(bounds.centerX), Math.floor(bounds.centerY), 50);
            return true;
        }
        return false;
    }

    private enterStore = async (step: Step): Promise<Step | undefined> => {
        log('等待搜索结果并寻找"进店"按钮...');
        await step.delay(1500);
        const enterBtns = step.findByTextAllMatch('进店');
        if (enterBtns.length > 0) {
            log('找到"进店"按钮，使用物理坐标点击进入...');
            await this.clickNodeByGesture(enterBtns[0]);
            await step.delay(4000); // 进店通常加载内容较多
            return step.next(this.openMemberTab);
        }

        const retryCount = (step.state.enterStoreRetry || 0) + 1;
        step.state.enterStoreRetry = retryCount;
        if (retryCount > 10) {
            log('长时间未找到"进店"按钮，终止任务。');
            return undefined;
        }

        return step.repeat({ delayMs: 2000 });
    };

    private openMemberTab = async (step: Step): Promise<Step | undefined> => {
        log('寻找店铺"会员"Tab...');
        await step.delay(1500);
        const memberTabs = step.findByTextAllMatch('会员');
        if (memberTabs.length > 0) {
            log('使用物理坐标点击会员Tab...');
            await this.clickNodeByGesture(memberTabs[memberTabs.length - 1]);
            await step.delay(3000); // 等待会员页加载
            return step.next(this.checkAndJoinMember);
        }

        const retryCount = (step.state.memberTabRetry || 0) + 1;
        step.state.memberTabRetry = retryCount;
        if (retryCount > 5) {
            log('多次未找到"会员"Tab，直接尝试进行下一步截图...');
            return step.next(this.startScreenshotLoop);
        }

        return step.repeat({ delayMs: 2000 });
    };

    private checkAndJoinMember = async (step: Step): Promise<Step | undefined> => {
        log('检查是否需要加入会员...');

        await step.delay(1500);

        const joinNodes = [
            ...step.findByTextAllMatch('立即加入会员'),
            ...step.findByTextAllMatch('0元入会'),
            ...step.findByTextAllMatch('加入会员')
        ];

        if (joinNodes.length > 0) {
            log('发现入会按钮，使用物理坐标点击入会...');
            await this.clickNodeByGesture(joinNodes[0]);
            await step.delay(2000);

            log('尝试勾选同意协议...');
            await step.delay(1500);
            const agreeNodes = step.findByTextAllMatch('同意');
            if (agreeNodes.length > 0) {
                await this.clickNodeByGesture(agreeNodes[0]);
            } else {
                const readNodes = step.findByTextAllMatch('我已阅读');
                if (readNodes.length > 0) await this.clickNodeByGesture(readNodes[0]);
            }
            await step.delay(1000);

            log('尝试使用物理坐标点击确认授权开通...');
            await step.delay(1500);
            const confirmNodes = [
                ...step.findByTextAllMatch('开通平台会员'),
                ...step.findByTextAllMatch('确认授权'),
                ...step.findByTextAllMatch('授权并开通'),
                ...step.findByTextAllMatch('确认')
            ];

            if (confirmNodes.length > 0) {
                await this.clickNodeByGesture(confirmNodes[confirmNodes.length - 1]);
            }

            log('入会操作完成，等待页面刷新...');
            await step.delay(4000);
        } else {
            log('未检测到加入会员按钮，假设已经是会员。');
        }

        return step.next(this.startScreenshotLoop);
    };

    /**
     * 查找页面中最大的可滚动内容区域节点，用于确定状态栏和导航栏的高度
     */
    private findContentNode(step: Step): any | null {
        const candidates = [
            ...step.findByTags('androidx.recyclerview.widget.RecyclerView'),
            ...step.findByTags(NodeClassValue.ScrollView),
            ...step.findByTags('android.widget.ListView'),
            ...step.findByTags('android.webkit.WebView'),
        ];

        if (candidates.length > 0) {
            let best = candidates[0];
            let bestArea = best.bounds.width * best.bounds.height;
            for (let i = 1; i < candidates.length; i++) {
                const area = candidates[i].bounds.width * candidates[i].bounds.height;
                if (area > bestArea) {
                    best = candidates[i];
                    bestArea = area;
                }
            }
            return best;
        }
        return null;
    }

    private startScreenshotLoop = async (step: Step): Promise<Step | undefined> => {
        const packageName = step.getPackageName();
        if (packageName !== this.taobaoPackageName) {
            log('检测到当前不在淘宝，请手动切换到目标长截图页面...');
            return step.repeat({ delayMs: 2000 });
        }

        log('开始长截图（自动滑动并截图）...');

        // 获取屏幕尺寸
        const screenSize = await AssistsXAsync.getScreenSize();
        const screenW = screenSize?.width || screenSize?.screenWidth || 1080;
        const screenH = screenSize?.height || screenSize?.screenHeight || 2400;
        log(`屏幕尺寸: ${screenW}x${screenH}`);

        // 确定裁剪区域：优先用节点边界，否则用屏幕百分比估算
        let cropTop = 0;
        let cropBottom = 0;

        const contentNode = this.findContentNode(step);
        if (contentNode && contentNode.bounds && contentNode.bounds.top > 0) {
            const b = contentNode.bounds;
            cropTop = b.top;
            cropBottom = screenH - b.bottom;
            log(`通过节点检测: cropTop=${cropTop}, cropBottom=${cropBottom}`);
        } else {
            cropTop = Math.floor(screenH * 0.10);
            cropBottom = Math.floor(screenH * 0.06);
            log(`节点未找到，使用百分比估算: cropTop=${cropTop}, cropBottom=${cropBottom}`);
        }

        // 滑动范围：必须在内容区域内部发起手势（避免触碰到 TabBar 和导航栏）
        const margin = 30; // 安全边距，避免手指落在 TabBar/导航栏上
        const scrollStartY = screenH - cropBottom - margin;  // 内容底部往上偏移
        const scrollEndY = cropTop + margin;                   // 内容顶部往下偏移
        log(`滑动范围: Y ${scrollStartY} -> ${scrollEndY}, 距离=${scrollStartY - scrollEndY}px`);

        let count = 0;
        const screenshotPaths: string[] = [];
        while (count < this.maxScreenshots) {
            count++;
            log(`正在截取第 ${count} 屏...`);

            const imagePath = await AssistsXAsync.takeScreenshotSave();
            if (imagePath) {
                screenshotPaths.push(imagePath);
            }

            await step.delay(300);

            try {
                await AssistsXAsync.performLinearGesture(
                    { x: Math.floor(screenW / 2), y: scrollStartY },
                    { x: Math.floor(screenW / 2), y: scrollEndY },
                    { duration: 2000 }
                );
            } catch (err) {
                log('滑动失败：' + err);
                break;
            }

            await step.delay(1500);
        }

        log(`截图完成，共截取了 ${screenshotPaths.length} 屏图片，开始拼接...`);

        if (screenshotPaths.length > 0) {
            try {
                const stitchedBase64 = await this.stitchImages(screenshotPaths, cropTop, cropBottom);

                const firstPath = screenshotPaths[0];
                const dir = firstPath.substring(0, firstPath.lastIndexOf('/'));
                const savePath = `${dir}/long_screenshot_${Date.now()}.jpg`;

                await fileIO.writeFileFromBytesByStream(savePath, stitchedBase64);
                await imageUtils.save2Album(savePath);

                log(`长图拼接完成！已保存到系统相册。`);
            } catch (err) {
                log('长图拼接失败：' + err);
            }
        }

        return undefined;
    };

    /**
     * 将多张全屏截图拼接为长图。
     *
     * 已知条件：滑动距离 = contentH - 2*margin，因此相邻帧重叠 = 2*margin 像素。
     * 第1张：保留 [0, H - cropBottom]（含顶部导航，去底部TabBar）
     * 第2张起：跳过 cropTop + overlap 像素（导航栏 + 重叠），保留到 H - cropBottom
     */
    private stitchImages = async (paths: string[], cropTop: number, cropBottom: number): Promise<string> => {
        const images: HTMLImageElement[] = [];

        for (let i = 0; i < paths.length; i++) {
            try {
                const base64Str = await fileIO.readFile2BytesByStream(paths[i]);
                if (!base64Str) continue;
                const dataUri = `data:image/png;base64,${base64Str}`;
                const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const image = new Image();
                    image.onload = () => resolve(image);
                    image.onerror = (e) => reject(e);
                    image.src = dataUri;
                });
                images.push(img);
            } catch (err) {
                log(`第 ${i + 1} 张图片加载失败: ${err}`);
            }
        }

        if (images.length === 0) throw new Error('没有可供拼接的图片');

        const W = images[0].width;
        const H = images[0].height;

        // 重叠量 = 2 * margin（滑动安全边距导致的固定重叠）
        const overlap = 0; // 2 * 30px margin

        // 第一张保留高度（含顶部导航，去底部 TabBar）
        const firstKeep = H - cropBottom;
        // 后续每张：跳过导航栏 + 重叠部分，保留到 TabBar 之前
        const restStart = cropTop + overlap;
        const restKeep = H - cropBottom - restStart;
        const totalHeight = firstKeep + Math.max(restKeep, 0) * (images.length - 1);

        log(`拼接: W=${W}, H=${H}, overlap=${overlap}, firstKeep=${firstKeep}, restStart=${restStart}, restKeep=${restKeep}, total=${totalHeight}`);

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = totalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('无法获取 Canvas 2D 上下文');

        let currentY = 0;
        for (let i = 0; i < images.length; i++) {
            if (i === 0) {
                ctx.drawImage(images[i], 0, 0, W, firstKeep, 0, currentY, W, firstKeep);
                currentY += firstKeep;
            } else {
                if (restKeep > 0) {
                    ctx.drawImage(images[i], 0, restStart, W, restKeep, 0, currentY, W, restKeep);
                    currentY += restKeep;
                }
            }
        }

        log('Canvas 绘制完成，导出 JPEG...');
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        return dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    };
}

export const taobaoLongScreenshotTask = new TaobaoLongScreenshotTask();
