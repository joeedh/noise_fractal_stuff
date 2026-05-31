import {
    UIBase, nstructjs, util, vectormath, math,
    Vector2, Vector3, Vector4, Matrix4, Quat,
    saveUIData, loadUIData
} from '../../path.ux/scripts/pathux.js';
import type {TabContainer, Container} from '../../path.ux/scripts/pathux.js';

import '../../core/app_ops.js';

import {Editor} from '../editor_base.js';
import {presetManager} from '../../pattern/preset.js';
import {abortRendering} from '../../core/render.js';
import type {SliderDef} from '../../pattern/pattern_types.js';
import type {ToolContext} from '../../core/context.js';
import type {PresetCategoryWidget} from '../widgets.js';

export class PropsEditor extends Editor {
    _last_update_key: string
    tabBar: TabContainer<ToolContext> | undefined
    tabs: TabContainer<ToolContext> | undefined

    constructor() {
        super();

        this._last_update_key = '';
        this.tabBar = undefined;
        this.tabs = undefined;
    }

    static define() {
        return {
            tagname: "props-editor-x",
            areaname: "props-editor",
            uiname: "Properties"
        }
    }

    copy() {
        let ret = UIBase.createElement<PropsEditor>(this.constructor.define().tagname)
        return ret
    }

    init() {
        super.init();

        this.rebuild();
    }

    rebuild() {
        let uidata = saveUIData(this.container, "uidata");

        if (this.tabBar) {
            this.tabBar.remove();
        }

        this.style["overflow"] = "scroll";

        let tabs = this.tabBar = this.container.tabs("left");

        let tab = tabs.tab("Main");
        let pat = this.ctx ? this.ctx.pattern : undefined;

        tab.prop("model.limitGPUPower");
        tab.prop("model.gpuSkipFactor");
        tab.prop("canvas.showSliders");

        if (this.ctx && this.ctx.pattern) {
            let con = tab.col();

            con.dataPrefix = "pattern";
            con.noMarginsOrPadding();

            // buildSidebar is typed with the default-CTX Container; ToolContext
            // is a ContextLike so widening con's invariant CTX generic is sound.
            this.ctx.pattern.constructor.buildSidebar(this.ctx, con as unknown as Container);
        }

        let panel;

        panel = tab.panel("Curves");

        let ckeys: Record<string, string> = {
            Combined: 'v',
            Red: 'r',
            Green: 'g',
            Blue: 'b'
        };

        panel.prop("pattern.use_curves");

        let htabs = panel.tabs("top");
        for (let k in ckeys) {
            let tab2 = htabs.tab(k);

            tab2.curve1d("pattern.curveset." + ckeys[k]);
        }

        panel.closed = true;

        panel = tab.panel("Builtin Presets");
        let list = UIBase.createElement<PresetCategoryWidget>("preset-category-x");
        list.setAttribute("no-delete-button", "true");
        list.dataPath = `presets.types.active.categories['Builtin']`;
        panel.add(list);

        tab = tabs.tab("Presets");

        //add builtin presets again here
        panel = tab.panel("Builtin Presets");
        list = UIBase.createElement<PresetCategoryWidget>("preset-category-x");
        list.setAttribute("no-delete-button", "true");
        list.dataPath = `presets.types.active.categories['Builtin']`;
        panel.add(list);

        let keys = util.list(presetManager.categoryKeys);
        if (keys.indexOf("My Presets") >= 0) {
            keys.remove("My Presets");
            keys = ["My Presets"].concat(keys);
        }

        keys.remove("Builtin");

        for (let k of keys) {
            panel = tab.panel(k);
            let list = UIBase.createElement<PresetCategoryWidget>("preset-category-x");
            list.dataPath = `presets.types.active.categories['${k}']`;

            panel.add(list);

            if (k !== 'Builtin') {
                panel.closed = true;
            }
        }

        tab = tabs.tab("Sliders");

        tab.style["marginLeft"] = "10px";

        let makeSlider = (i: number, sdef: SliderDef) => {
            let range = sdef.range ?? [-1000000, 1000000];

            let path = `pattern.sliders[${i}].value`;
            let elem = tab.prop(path);

            elem.useDataPathUndo = true;

            elem.setAttribute("labelOnTop", "false");
            elem.setAttribute("name", sdef.name);
            elem.setAttribute("decimalPlaces", "4");

            elem.setAttribute("min", String(range[0]));
            elem.setAttribute("max", String(range[1]));
            //elem.setAttribute("expRate", sdef.exp ?? 1.0);
            //let speed = (range[1] - range[0])*0.001*(sdef.speed ?? 1.0);
            let speed = sdef.speed ?? 1.0;

            elem.setAttribute("step", String(speed * 0.1));

            elem.onchange = () => {
                if (!sdef.noReset) {
                    this.ctx.pattern.drawGen++;
                }
            }
        }
        if (pat) {
            let sdefs = pat.constructor.patternDef().sliderDef;

            for (let i = 0; i < Math.min(pat.sliders.length, sdefs.length); i++) {
                let sdef = sdefs[i];

                if (typeof sdef === "string") {
                    sdef = {name: sdef};
                }

                makeSlider(i, sdef);
            }
        }

        tab = tabs.tab("Export");
        panel = tab.toolPanel("app.export");
        panel.button("Stop", () => {
            abortRendering();
        });

        this.setCSS();

        loadUIData(this.container, uidata);
        this.flushUpdate();
    }

    setCSS() {
        super.setCSS();

        if (this.tabs && this.size) {
            this.tabs.style["height"] = this.size[1] + "px";
        }
    }

    update() {
        super.update();

        if (!this.ctx || !this.ctx.pattern) {
            return;
        }

        let key = this.ctx.pattern.typeName;
        if (key !== this._last_update_key) {
            this._last_update_key = key;
            this.rebuild();
        }
    }
};
PropsEditor.STRUCT = nstructjs.inherit(PropsEditor, Editor) + `
  
}`;
Editor.register(PropsEditor);
nstructjs.register(PropsEditor);
