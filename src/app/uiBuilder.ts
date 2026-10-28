// @ts-ignore
import { r, re, h, $, $all, on } from '../utilities/shorthands.js';
import { UICyclicDependenciesList } from './uiCyclicDependenciesList.js';
import { UIEdgeControls } from './uiEdgeControl.js';
import { UIInspectionControls } from './uiInspectionControls.js';
import { UIRefactoringsList } from './uiRefactoringsList.js';


type tab = "normal" | "preview"

export class UIBuilder {
    private root: string; // root element
    private normalTab: any;
    private previewTab: any;
    private showInspectionControls: boolean;
    
    constructor(root: string) {
        this.root = root
        const tabs = this.createTabs(["normal", "preview"])
        this.normalTab = tabs[0];
        this.previewTab = tabs[1];
        this.showInspectionControls = false;
        // const cdList = new UICyclicDependenciesList()
        re(this.normalTab, [
            h('h2', {id: "inspection-controls-normal"}, ['Inspection controls']),
            h('h2', {}, ['Edge controls']),
        ], true)
        re(this.previewTab, [
            h('h2', {id: "inspection-controls-preview"}, ['Inspection controls']),
            h('h2', {}, ['Edge controls']),
        ], true)
        
        
    }

   

    buildCyclicDependenciesList(state: any) {
        const inspectionControls = new UIInspectionControls(state)
        const cdList = new UICyclicDependenciesList(state, () => r("#inspection-controls-normal", [inspectionControls.render()], false))
        r(this.root, [cdList.render()], false)
        r("#inspection-controls-normal", [inspectionControls.render()], false)
    }

    buildNormalEdgeControls(state: any) {
        const edgeControls = new UIEdgeControls(state)
        r("#inspection-controls-normal", [edgeControls.render()], false)
    }

    buildRefactoringList(state: any, ctx:any) {
        const inspectionControls = new UIInspectionControls(state)
        const cdList = new UIRefactoringsList(state, ctx, () => r("#inspection-controls-preview", [inspectionControls.render()], true))
        r(this.root, [cdList.render()], false)
        r("#inspection-controls-preview", [inspectionControls.render()], true)
    }

     build() {

        // TODO add function to add scope selection to the tabs, and easy functions to hide them and such.
        // And maybe add graphcontrols, that is an adpter between ui and graph actions (hide/show edges, scope, not save and export svg).
        
        // this.listScopes(tabs[0])

    }

    addComponent(component: any) {
        r(this.root, [component.render()], false)
    }

    getTab(tab: tab) {
        if (tab === "normal") {
            return this.normalTab
        } else {
            return this.previewTab
        }
    }

    createTabs(tabs: string[]) {
        const id = tabs.join("")
        const tabElements = tabs.map((tabname) => h('div', {class: 'sidebar-tab', id: `tab-${tabname}`}, []))
        r(this.root, [
            h('div', {class: 'tab-bar', id: id}, [
                h('ul', {class: 'tabs'}, [
                    ...tabs.map((tabname) => 
                        h('li', {}, [
                            h('a', {class: 'tabs tablink', 'data-tab': `tab-${tabname}`}, tabname)
                        ]),
                    )
                ])

            ]),
            ...tabElements
        ], false)
        const tablinks: NodeListOf<any> = $all(`#${id} .tablink`);
        on('click', tablinks, (event: any) => {
            tablinks.forEach((t) => t.classList.remove('active'));
            if (event === null && event.target) {return}
            event.target.classList.add('active');
            const selectedTab = event.target.getAttribute('data-tab');
            tabs.forEach((tabname) => $(`[id="tab-${tabname}"]`).style.display = 'none')
            $(`[id="${selectedTab}"]`).style.display = 'block';
        });

        return tabElements
	}
}