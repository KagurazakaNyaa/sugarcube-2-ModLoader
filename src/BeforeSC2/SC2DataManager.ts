import {PassageDataItem, SC2DataInfo, SC2DataInfoCache} from './SC2DataInfoCache';
import {ModDataLoadType, ModInfo, ModLoader} from "./ModLoader";
import {cloneDeep, isSafeInteger} from "lodash";
import {
    concatMergeSC2DataInfoCache,
    normalMergeSC2DataInfoCache,
    replaceMergeSC2DataInfoCache
} from "./MergeSC2DataInfoCache";
import {SimulateMergeResult} from "./SimulateMerge";
import {ModLoadController} from "./ModLoadController";
import {ReplacePatcher} from "./ReplacePatcher";
import {AddonPluginManager} from "./AddonPlugin";
import {DependenceChecker} from "./DependenceChecker";
import {PassageTracer} from "./PassageTracer";
import {Sc2EventTracer} from "./Sc2EventTracer";
import {SC2JsEvalContext} from "./SC2JsEvalContext";
import {ModUtils} from "./Utils";
import {JsPreloader} from "./JsPreloader";

export class SC2DataManager {

    constructor(
        public thisWin: Window,
    ) {
    }

    get rootNode() {
        return this.thisWin.document.getElementsByTagName('tw-storydata')[0];
    }

    get styleNode() {
        return this.rootNode.getElementsByTagName('style');
    }

    get scriptNode() {
        return this.rootNode.getElementsByTagName('script');
    }

    get passageDataNodeList() {
        return Array.from(this.rootNode.getElementsByTagName('tw-passagedata'));
    }

    checkSC2Data() {
        const rNodes = this.thisWin.document.getElementsByTagName('tw-storydata');
        if (!rNodes) {
            console.error('checkSC2Data() (!rNodes)');
            return false;
        }
        if (rNodes.length !== 1) {
            console.error('checkSC2Data() (rNodes.length !== 1)');
            return false;
        }
        const rNode = rNodes[0];
        const stNodes = rNode.getElementsByTagName('style');
        if (!stNodes) {
            console.error('checkSC2Data() (!stNodes)');
            return false;
        }
        if (stNodes.length !== 1) {
            console.error('checkSC2Data() (stNodes.length !== 1)');
            return false;
        }
        const stNode = stNodes[0];
        const scNodes = rNode.getElementsByTagName('script');
        if (!scNodes) {
            console.error('checkSC2Data() (!scNodes)');
            return false;
        }
        if (scNodes.length !== 1) {
            console.error('checkSC2Data() (scNodes.length !== 1)');
            return false;
        }
        const passageDataNodes = rNode.getElementsByTagName('tw-storydata');
        if (!passageDataNodes) {
            console.error('checkSC2Data() (!passageDataNodes)');
            return false;
        }
        if (passageDataNodes.length < 1) {
            console.error('checkSC2Data() (passageDataNodes.length < 1)');
            return false;
        }
        const nn = Array.from(rNode.childNodes).map((T) => T.nodeName).filter(T => T.toUpperCase() !== 'TW-PASSAGEDATA');
        if (nn.length !== 2) {
            console.warn('checkSC2Data() (nn.length !== 2) some addtion unkown node in tw-storydata');
        }
        return true;
    }

    createNewSC2DataInfoFromNow(): SC2DataInfo {
        return new SC2DataInfoCache(
            this.getModLoadController().getLog(),
            'orgin',
            Array.from(this.scriptNode),
            Array.from(this.styleNode),
            Array.from(this.passageDataNodeList) as HTMLElement[],
        );
    }

    /**
     * 用于缓存原始的没有经过任何修改的原始的原版SC2Data
     * never set it to undefined OR overwrite it
     * @private
     */
    private originSC2DataInfoCache?: SC2DataInfoCache;

    earlyResetSC2DataInfoCache() {
        // keep originSC2DataInfoCache valid
        this.initSC2DataInfoCache();
        // this.originSC2DataInfoCache = undefined;
        // this.getSC2DataInfoCache();
        this.flushAfterPatchCache();
    }

    cleanAllCacheAfterModLoadEnd() {
        this.originSC2DataInfoCache?.clean();
        this.originSC2DataInfoCache = undefined;
        this.cSC2DataInfoAfterPatchCache?.clean();
        this.cSC2DataInfoAfterPatchCache = undefined;
    }

    initSC2DataInfoCache() {
        if (!this.originSC2DataInfoCache) {
            this.originSC2DataInfoCache = new SC2DataInfoCache(
                this.getModLoadController().getLog(),
                'orgin',
                Array.from(this.scriptNode),
                Array.from(this.styleNode),
                Array.from(this.passageDataNodeList) as HTMLElement[],
            );
            // console.log('getSC2DataInfoCache() init', this.originSC2DataInfoCache);
        }
    }

    /**
     * 读取原始的没有被修改过的SC2Data，
     * 对于mod来说，如无必要不要使用这里的数据，
     * 特别是合并时不要使用此处的数据作为数据源，而是使用 getSC2DataInfoAfterPatch()，否则会覆盖之前的mod的修改，导致之前的修改无效
     */
    getSC2DataInfoCache() {
        this.initSC2DataInfoCache();
        // console.log('getSC2DataInfoCache() get', this.originSC2DataInfoCache);
        // TODO a immutable clone
        return this.originSC2DataInfoCache;
    }

    private modLoader?: ModLoader;

    getModLoader() {
        if (!this.modLoader) {
            console.log('this.modLoadControllerCallback', this.getModLoadController());
            this.modLoader = new ModLoader(this, this.getModLoadController(), this.thisWin);
        }
        return this.modLoader;
    }

    private modLoadController?: ModLoadController;

    getModLoadController() {
        if (!this.modLoadController) {
            this.modLoadController = new ModLoadController(this);
        }
        return this.modLoadController;
    }

    private passageTracer = new PassageTracer(this.thisWin);

    getPassageTracer() {
        return this.passageTracer;
    }

    private sc2EventTracer = new Sc2EventTracer(this.thisWin);

    getSc2EventTracer() {
        return this.sc2EventTracer;
    }

    private modUtils = new ModUtils(this, this.thisWin);

    getModUtils() {
        return this.modUtils;
    }

    private jsPreloader = new JsPreloader(this, this.modUtils, this.thisWin);

    getJsPreloader() {
        return this.jsPreloader;
    }

    private addonPluginManager = new AddonPluginManager(this, this.getModLoadController());

    getAddonPluginManager() {
        return this.addonPluginManager;
    }

    private sC2JsEvalContext = new SC2JsEvalContext(this);

    getSC2JsEvalContext() {
        return this.sC2JsEvalContext;
    }

    private conflictResult?: { mod: SC2DataInfo, result: SimulateMergeResult }[];

    startInitOk = false;

    async startInit() {
        if (this.startInitOk) {
            console.log('ModLoader ====== SC2DataManager startInit() already start');
            return;
        }
        this.startInitOk = true;

        console.log('ModLoader ====== SC2DataManager startInit() start');

        // keep originSC2DataInfoCache valid, keep it have the unmodified vanilla data
        this.initSC2DataInfoCache();

        await this.getModLoader().loadMod([
            ModDataLoadType.Remote,
            ModDataLoadType.Local,
            ModDataLoadType.IndexDB,
            ModDataLoadType.LocalStorage,
        ]);

        new DependenceChecker(this, this.getModUtils()).check();

        this.conflictResult = this.getModLoader().checkModConflictList();
        console.log('ModLoader ====== mod conflictResult', this.conflictResult.map(T => {
            return {
                name: T.mod.dataSource,
                style: Array.from(T.result.styleFileItems.conflict),
                script: Array.from(T.result.scriptFileItems.conflict),
                passage: Array.from(T.result.passageDataItems.conflict),
            };
        }));

        await this.getAddonPluginManager().triggerHook('beforePatchModToGame');
        await this.patchModToGame();
        await this.getAddonPluginManager().triggerHook('afterPatchModToGame');
        this.getModLoadController().logInfo('ModLoader ====== SC2DataManager startInit() end. To Start JsPreloader.....');
    }

    getConflictResult() {
        return this.conflictResult;
    }

    private cSC2DataInfoAfterPatchCache?: SC2DataInfoCache;

    /**
     * 获取最新的SC2Data，此处获得的是之前的mod修改后的最新的SC2Data数据，
     * 此处使用了缓存，如果修改了SC2Data，请调用 flushAfterPatchCache() 来清除缓存，重新从html中读取最新的SC2Data
     */
    getSC2DataInfoAfterPatch() {
        // keep originSC2DataInfoCache valid
        this.initSC2DataInfoCache();
        if (!this.cSC2DataInfoAfterPatchCache) {
            this.cSC2DataInfoAfterPatchCache = new SC2DataInfoCache(
                this.getModLoadController().getLog(),
                'orgin',
                Array.from(this.scriptNode),
                Array.from(this.styleNode),
                Array.from(this.passageDataNodeList) as HTMLElement[],
            );
            // console.log('getSC2DataInfoAfterPatch() init', this.cSC2DataInfoAfterPatchCache);
            console.log('getSC2DataInfoAfterPatch() init cloneSC2DataInfo', this.cSC2DataInfoAfterPatchCache.cloneSC2DataInfo());
        }
        // console.log('getSC2DataInfoAfterPatch() get', this.cSC2DataInfoAfterPatchCache);
        return this.cSC2DataInfoAfterPatchCache;
    }

    flushAfterPatchCache() {
        this.cSC2DataInfoAfterPatchCache = undefined;
        this.getSC2DataInfoAfterPatch();
    }

    async applyReplacePatcher(modSC2DataInfoCache: SC2DataInfo) {

        const modCache = this.getModLoader().modCache;
        const modOrder = this.getModLoader().modOrder;

        for (const modName of modOrder) {
            const mod = modCache.get(modName);
            if (!mod) {
                console.error('applyReplacePatcher() (!mod)', [modName]);
                continue;
            }
            for (const rp of mod.replacePatcher) {
                console.log('ModLoader ====== applyReplacePatcher() Replace Patch', [modName, rp.patchFileName]);
                await this.getModLoadController().ReplacePatcher_start(modName, rp.patchFileName);
                const log = this.getModLoadController().getLog();
                try {
                    rp.applyReplacePatcher(modSC2DataInfoCache);
                } catch (e: any | Error) {
                    console.error('ModLoader ====== applyReplacePatcher() Replace Patch Error: ', e);
                    log.error(`ModLoader ====== applyReplacePatcher() Replace Patch Error: [${e?.message ? e.message : e}]`);
                }
                await this.getModLoadController().ReplacePatcher_end(modName, rp.patchFileName);
                console.log('ModLoader ====== applyReplacePatcher() Replace Patch', [modName, rp.patchFileName]);
            }
        }

    }

    async patchModToGame() {
        await this.getModLoadController().PatchModToGame_start();

        const modCache = this.getModLoader().modCache;
        const modOrder = this.getModLoader().modOrder;
        this.cSC2DataInfoAfterPatchCache = undefined;
        this.flushAfterPatchCache();
        const originSC2DataInfoCache = this.getSC2DataInfoAfterPatch();

        // concat mod
        console.log('ModLoader ====== patchModToGame() Concat Mod');
        const em = normalMergeSC2DataInfoCache(
            new SC2DataInfo(this.getModLoadController().getLog(), 'EmptyMod'),
            ...modOrder.map(T => modCache.get(T))
                .filter((T): T is ModInfo => !!T)
                .map(T => T.cache)
        );
        // console.log('em scriptFileItems length', em.scriptFileItems.items.length);
        // console.log('originSC2DataInfoCache scriptFileItems length', originSC2DataInfoCache.scriptFileItems.items.length);

        // replace orgin img
        // for (const imgRPath of this.getModLoader().getModImgFileReplaceList()) {
        //     em.passageDataItems.items.forEach(T => {
        //         T.content = T.content.replace(imgRPath[0], imgRPath[1]);
        //     });
        //     em.styleFileItems.items.forEach(T => {
        //         T.content = T.content.replace(imgRPath[0], imgRPath[1]);
        //     });
        //     em.scriptFileItems.items.forEach(T => {
        //         T.content = T.content.replace(imgRPath[0], imgRPath[1]);
        //     });
        // }

        // console.log('originSC2DataInfoCache', originSC2DataInfoCache.scriptNode[0].innerHTML);
        // console.log('patchModToGame() originSC2DataInfoCache', structuredClone(originSC2DataInfoCache.scriptFileItems));
        // console.log('em', em);
        console.log('ModLoader ====== patchModToGame() Replace Game');
        // then replace origin
        const modSC2DataInfoCache = replaceMergeSC2DataInfoCache(
            originSC2DataInfoCache.cloneSC2DataInfo(),
            em,
        );
        // console.log('patchModToGame() originSC2DataInfoCache', structuredClone(originSC2DataInfoCache.scriptFileItems));
        // console.log('patchModToGame() originSC2DataInfoCache', originSC2DataInfoCache);
        // console.log('patchModToGame() modSC2DataInfoCache', modSC2DataInfoCache);
        // console.log('patchModToGame() modSC2DataInfoCache scriptFileItems length', modSC2DataInfoCache.scriptFileItems.items.length);

        await this.applyReplacePatcher(modSC2DataInfoCache);

        const newScriptNode = this.makeScriptNode(modSC2DataInfoCache);

        const newStyleNode = this.makeStyleNode(modSC2DataInfoCache);

        // console.log('modSC2DataInfoCache.passageDataItems.items', modSC2DataInfoCache.passageDataItems.items);

        const newPassageDataNode = modSC2DataInfoCache.passageDataItems.items.map(T => {
            return this.makePassageNode(T);
        });

        // console.log('patchModToGame() newScriptNode', newScriptNode);
        // console.log('patchModToGame() newStyleNode', newStyleNode);
        // console.log('patchModToGame() newPassageDataNode', newPassageDataNode);

        const rootNode = this.rootNode;
        const styleNode = this.styleNode;
        const scriptNode = this.scriptNode;
        const passageDataNodeList = this.passageDataNodeList;

        // remove old
        for (const node of Array.from(styleNode)) {
            rootNode.removeChild(node);
        }
        for (const node of Array.from(scriptNode)) {
            rootNode.removeChild(node);
        }
        for (const node of Array.from(passageDataNodeList)) {
            rootNode.removeChild(node);
        }

        // add new
        rootNode.appendChild(newScriptNode);
        rootNode.appendChild(newStyleNode);
        for (const node of newPassageDataNode) {
            rootNode.appendChild(node);
        }

        // update cache
        this.flushAfterPatchCache();

        await this.getModLoadController().PatchModToGame_end();
    }

    makePassageNode(T: PassageDataItem) {
        const s = this.thisWin.document.createElement('tw-passagedata');
        if (T.id && T.id > 0) {
            s.setAttribute('pid', '' + T.id);
        }
        s.setAttribute('name', T.name);
        // console.log('tags', T.tags);
        s.setAttribute('tags', T.tags?.join(' ') || '');
        if (T.position) {
            s.setAttribute('position', T.position);
        }
        if (T.size) {
            s.setAttribute('size', T.size);
        }
        // s.innerText = `:: Widgets ${T.name}${T.tags?.length > 0 ? ` [${T.tags.join(' ')}]` : ''}\n${T.content}\n`;
        s.textContent = T.content;
        // s.innerHTML = T.content;
        return s;
    }

    makeStyleNode(sc: SC2DataInfo) {
        const newStyleNodeContent = sc.styleFileItems.items.reduce((acc, T) => {
            return acc + `/* twine-user-stylesheet #${T.id}: "${T.name}" */${T.content}\n`;
        }, '');
        // console.log('makeStyleNode', newStyleNodeContent);
        const newStyleNode = this.thisWin.document.createElement('style');
        newStyleNode.setAttribute('type', 'text/twine-css');
        newStyleNode.setAttribute('role', 'stylesheet');
        newStyleNode.setAttribute('id', 'twine-user-stylesheet');
        newStyleNode.textContent = newStyleNodeContent;
        return newStyleNode;
    }

    makeScriptNode(sc: SC2DataInfo) {
        sc.scriptFileItems.items = sc.scriptFileItems.items.sort((a, b) => {
            if (isSafeInteger(a.id) && isSafeInteger(b.id)) {
                if (a.id < b.id) {
                    return -1;
                }
                if (a.id === b.id) {
                    return 0;
                }
                if (a.id > b.id) {
                    return 1;
                }
            }
            if (isSafeInteger(a.id)) {
                return -1;
            }
            if (isSafeInteger(b.id)) {
                return 1;
            }
            return 0;
        });
        const newScriptNodeContent = sc.scriptFileItems.items.reduce((acc, T) => {
            return acc + `/* twine-user-script #${T.id}: "${T.name}" */${T.content}\n`;
        }, '');
        // console.log('makeScriptNode', newScriptNodeContent);
        const newScriptNode = this.thisWin.document.createElement('script');
        newScriptNode.setAttribute('type', 'text/twine-javascript');
        newScriptNode.setAttribute('role', 'script');
        newScriptNode.setAttribute('id', 'twine-user-script');
        newScriptNode.textContent = newScriptNodeContent;
        return newScriptNode;
    }

    rePlacePassage(toRemovePassageDataNodeList: Element[], toAddPassageDataNodeList: Element[],) {
        console.log('rePlacePassage()', toRemovePassageDataNodeList, toAddPassageDataNodeList);
        const rootNode = this.rootNode;
        console.log('rePlacePassage() rootNode', rootNode);
        const log = this.getModLoadController().getLog();
        for (const node of toRemovePassageDataNodeList) {
            const rn = rootNode.removeChild(node);
            if (!rn) {
                console.log('rePlacePassage() (!rn)', [node]);
                log.warn(`rePlacePassage() (!rn) [${node.getAttribute('name')}]`);
            }
        }
        for (const node of toAddPassageDataNodeList) {
            const an = rootNode.appendChild(node);
            if (!an) {
                console.log('rePlacePassage() (!an)', [node]);
                log.warn(`rePlacePassage() (!an) [${node.getAttribute('name')}]`);
            }
        }
    }

}
