import cytoscape from "cytoscape";

export class ExpansionLayout {
    private classBaseline: { [key: string]: {x: number, y: number, height: number}} = {};
    private viewport: { zoom: number; pan: cytoscape.Position } | null = null;


    setBaseline = (state: any) => {
        this.viewport = {zoom: state.cy.zoom(), pan: {x: state.cy.pan().x, y: state.cy.pan().y}};
        const classBaseline: { [key: string]: {x: number, y: number, height: number}} = {};

        state.cy.$(".Type").forEach((node: any) => {
            classBaseline[node.id()] = {
                x: node.position("x"),
                y: node.position("y"),
                height: node.height(),
            };
        });
        this.classBaseline = classBaseline
        return classBaseline
    };

    reset = (state: any) => {
        state.cy.$(".Type").forEach((node: any) => {
            node.position({
                x: this.classBaseline[node.id()].x,
                y: this.classBaseline[node.id()].y,
            });
        });
        for (const key of Object.keys(state.hiddenNodes.methods)) {
            state.hiddenNodes.methods[key].remove();
            state.hiddenNodes.variables[key].remove();
        }
        state.cy.animate(this.viewport);
    }

    layoutExpandClasses2 = (state: any, classesToExpand: string[]) => {
        const cy = state.cy;
        const baseline = this.setBaseline(state);
        const headerHeight = 35;
        const memberHeight = 22;
        const gap = 4;
        const layoutGap = 20;

        // Hide all previously restored members.
        for (const key of Object.keys(state.hiddenNodes.methods)) {
            state.hiddenNodes.methods[key].remove();
            state.hiddenNodes.variables[key].remove();
        }

        // Restore members of the classes we want to expand.
        classesToExpand.forEach((id) => {
            state.hiddenNodes.methods[id].restore();
            state.hiddenNodes.variables[id].restore();
        });

        // Position members relative to each class's original position.
        classesToExpand.forEach((id) => {
            const classNode = cy.getElementById(id);
            const original = baseline[id];
            const members = classNode.children();

            members.forEach((member: any, index: number) => {
                member.position({
                    x: original.x,
                    y: original.y
                        + headerHeight
                        + index * (memberHeight + gap),
                });
            });
        });

        // Calculate the extra height required by each expanded class.
        const expansions = classesToExpand.map((id) => {
            const node = cy.getElementById(id);
            const original = baseline[id];

            const extraHeight = Math.max(
                0,
                node.height() - original.height
            );

            return {
                id,
                baselineY: original.y,
                x: original.x,
                y: original.y,
                height: node.height(),
                width: node.width(),
                extraHeight,
            };
        });

        const expansionsTotalHeight = expansions.reduce((total, expansion) => {
                    return total + expansion.extraHeight + layoutGap;
            }, 0);
        const topExpansionY = Math.min(...expansions.map((e) => e.baselineY))

        // Reposition every class from its original baseline.
        cy.$(".Type").forEach((node: any) => {
            const original = baseline[node.id()];
            if (!original) return;

            
            let shiftY;
            if (classesToExpand.includes(node.id())) {
                shiftY = expansions.reduce((total, expansion) => {
                    // Only classes originally below this expansion are shifted.
                    // return total + expansion.extraHeight + layoutGap;
                    if (original.y > expansion.baselineY) {
                        return total + expansion.extraHeight + layoutGap;
                    }
    
                    return total;
                }, 0);
            } else {
                shiftY = original.y < topExpansionY ? 0 : expansionsTotalHeight + layoutGap;
            }

            node.position({
                x: original.x,
                y: original.y + shiftY,
            });
        });
    };

}