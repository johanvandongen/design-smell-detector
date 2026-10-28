// @ts-ignore
import { $, $all, h, on, r, toJson, toText } from '../utilities/shorthands.js';
import { ExpansionLayout } from './expansionLayout';

export class UIInspectionControls {
    private state: any;
    private expansionLayouter;

    constructor(state: any) {
        this.state = state
        this.expansionLayouter = new ExpansionLayout();
    }

    selectScope = (target: any) => {
        const scope = target.value
        if (target.checked) {
            this.state.inspect.scopes.add(scope)
        } else {
            this.state.inspect.scopes.delete(scope)
        }
    }

    toggleNodes = (expand: boolean) => {
        if (expand) {
            if (this.state.inspect === null) {
                return;
            }
            const scc = this.state.stronglyConnectedComponents[this.state.inspect.index];
            this.expansionLayouter.layoutExpandClasses2(this.state, scc)
        } else {
            this.expansionLayouter.reset(this.state)
        }
    }

    listScopesEmty() {
        const el =  h('p', {opacity: '0.1'}, 'Select a CD for inspection controls')
        el.style.opacity = '0.1';
        return el;
    }

    exit() {
        this.state.inspect = null
        this.toggleNodes(false);
        this.listScopesEmty()
    }

    render() {
        if (this.state.inspect === null) {
            return this.listScopesEmty();
        }

        const scopes = ["Inside", "Boundary", "Outside"]
        return h("div", {id: 'test'}, [
            h('div', {id:"sc"}, [
                h('h2', {}, ['Inspection controls']),
                h('label', {}, [
                    h('input', {
                        type: 'checkbox',
                        id: `toggle-methods`,
                        name: 'scope',
                        value: true,
                        class: 'scope-input',
                    }, [], {
                        change: (event: any) => {
                            this.toggleNodes(event.target.checked)
                        },
                    }, (e: any) => {
                        e.checked = false;
                    }),
                    "Toggle show/hide method and fields"
                ]),
                h('h3', {}, 'Edge scope'),
                h('div', {class: 'edge-scopes', id:"sc"}, scopes.map((scope) => 
                    h('label', {}, [
                        h('input', {
                            type: 'checkbox',
                            id: `scope-${scope}`,
                            name: 'scope',
                            value: scope,
                            class: 'scope-input',
                        }, [], {
                            change: (event: any) => this.selectScope(event.target),
                        }, (e: any) => {
                            e.checked = this.state.inspect.scopes.has(scope);
                        }),
                        scope,
                    ]),
                )),
                h('button', {}, 'Exit CD inspection mode', {
                    click: (event: any) => {
                        document.querySelectorAll('#menu-cycles .selectable-list-item.active').forEach((el) => el.classList.remove('active'));
                        r("#inspection-controls-normal", [
                            this.listScopesEmty()
                        ])
                        this.exit()
                    }
                }),
            ])
        ])
    }
}