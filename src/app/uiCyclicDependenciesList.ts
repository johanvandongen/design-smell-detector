// @ts-ignore
import { $, $all, h, on, r, toJson, toText } from '../utilities/shorthands.js';
import { ExpansionLayout } from './expansionLayout.js';
import { UIInspectionControls } from './uiInspectionControls.js';

export class UICyclicDependenciesList {
    private state: any;
    private onInspect: (idx: number) => void;

    constructor(state: any, onInspect: (idx: number) => void) {
        this.state = state
        this.onInspect = onInspect
    }

    inspectCD = (idx: number) => {
        if (this.state.inspect && this.state.inspect.index === idx) {
            return
        }
        const scc: string[] = this.state.stronglyConnectedComponents[idx]
        
        const nodes = [...scc];
        scc.forEach((id) => {
            this.state.cy.getElementById(id).children().forEach((child: any) => {
                nodes.push(child.id())
            })
        })

        this.state.inspect = {
            index: idx,
            hiddenEdges: {},
            scopes: new Set(["Inside"]),
            nodes: nodes
        }
        this.onInspect(idx)


        // Zoom in to SCC
        this.state.cy.animate({
            zoom: 0.5,
            center: {
                eles: this.state.cy.getElementById(scc[0])
            }
        });
    }

    render() {
        return h('div', {}, [
                h('h2', {}, ['Cyclic Dependencies']),
                h('ul', {}, this.state.stronglyConnectedComponents.map((cycle: any, idx: number) => 
                    h('li', {class: 'selectable-list-item'}, [
                        h('h3', {}, `Cycle ${idx + 1}`),
                        h('p', {}, `${cycle.join(' -> ')}`),
                        h('button', {}, 'Inspect', {
                            click: (event: any) => {
                                const item = event.currentTarget.closest('li');
                                item.parentElement.querySelectorAll('#menu-cycles .selectable-list-item.active').forEach((el: any) => el.classList.remove('active'));
                                item.classList.add('active')
                                this.inspectCD(idx)
                            }
                        })
                    ])
                )),
            ]);
    }
}