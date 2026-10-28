// @ts-ignore
import { DependencyInjectionStrategy } from '../refactoring/dependencyInjectionStrategy.js';
import { ExtractInterfaceStrategy } from '../refactoring/extractInterfaceStrategy.js';
// @ts-ignore
import { $, $all, h, on, r, toJson, toText } from '../utilities/shorthands.js';
// @ts-ignore
import { applyRefactoringChangeSet, showNeighborhood } from '../graphProcessing/visualTransformations.js'
// @ts-ignore
import { createAppState } from './state.js';
// @ts-ignore
import { createVisualPipeline } from './graphPipeline.js';
// @ts-ignore
import { highlight, relayout } from '../uiControls/graphPanel.js';

export class UIRefactoringsList {
    private state: any;
    private ctx: any
    private onInspect: (idx: number) => void;

    constructor(state: any, ctx: any, onInspect: (idx: number) => void) {
        this.state = state
        this.ctx = ctx;
        this.onInspect = onInspect
    }

    previewRefactoring = async (refactoring: any) => {
            const statePreview = createAppState()
    
            // Copy original graph including the hidden edges
            const elements = {
                nodes: this.state.cy.nodes().jsons(),
                edges: [
                    ...this.state.cy.edges().jsons(),
                    ...Object.values(this.state.hiddenEdges ?? {})
                    .filter(Boolean)
                    .flatMap((edges: any) => edges.jsons())
                ]
            };
            const numEdges = this.state.hcy.edges().length;
            const cynew = await this.ctx.cyAdapter.createVisual($('#cypreview'), elements, this.ctx.style, numEdges > 5000);
            
            let strategy;
            switch( refactoring.kind) {
                case "extract-interface":
                    strategy = new ExtractInterfaceStrategy();
                    break;
                case "dependency-injection":
                    strategy = new DependencyInjectionStrategy();
                    break;
                default:
                    throw Error("No strategy found")
            }
            const changeSet = strategy.apply(this.state.hcy, refactoring);
            applyRefactoringChangeSet(cynew, changeSet, this.state)
            const visualPipeline = createVisualPipeline({ state: statePreview });
            this.ctx.cyAdapter.batch(cynew, () => {
                visualPipeline({ cy: cynew });
            });
    
            const scc = this.state.stronglyConnectedComponents[this.state.inspect.index]
            const nodes = cynew.nodes().filter((n: any) => n.data("labels").includes("Modified") || n.data("labels").includes("New") || scc.includes(n.id())).map((n: any) => n.id())
            statePreview.inspect = {
                index: 0,
                hiddenEdges: {},
                scopes: new Set(["Inside"]),
                nodes: nodes
            }
            
            this.onInspect(1)

            // const actionsPreview = createActions({state:statePreview, this.ctx.ui})
            // actionsPreview.initializePostRender(cynew, "#reltab2");
            relayout(cynew, $('#selectlayout').options[$('#selectlayout').selectedIndex].value);
            
            
            // const actionsPreview = createActions({state:statePreview, ui})
            // actionsPreview.initializePostRender(cynew, "#reltab2");
    
            cynew.once('layoutstop', () => {
                const node = cynew.getElementById(changeSet.focus);
    
                cynew.animate({
                    zoom: 0.8,
                    center: {
                        eles: node
                    }
                });
            });
        }

    render() {
        return h('div', {id: "menu-refactor"}, [
                    h('h2', {}, ['Refactoring Opportunities']),
                    h('ul', {}, this.state.refactorings.map((refactoring: any, idx: number) => 
                        h('li', {class: 'selectable-list-item'}, [
                            h('h3', {}, `Option ${idx + 1}`),
                            h('p', {}, `${refactoring.kind} for ${refactoring.targetClass}`),
                            h('button', {}, 'preview', {
							click: (event: any) => {
                                const item = event.currentTarget.closest('li');
                                item.parentElement.querySelectorAll('#menu-refactor .selectable-list-item.active').forEach((el: any) => el.classList.remove('active'));
                                item.classList.add('active')
                                this.previewRefactoring(refactoring)
                            },
						})
                        ])
                    )),
                ]);
    }
}