import { EdgeDataDefinition, NodeDataDefinition } from 'cytoscape';
import { GraphAbtractizer } from './graphAbtractizer';
import { GraphValidator } from './graphValidator';

export interface Graph {
    original: RawGraphData;
    abstract: GraphData;
    coloringMeta: { nodes: Array<{ data: RawNodeData }>; edges: Array<{ data: RawEdgeData }> };
}

export interface RawGraphData {
    elements: {
        nodes: Array<{ data: RawNodeData }>;
        edges: Array<{ data: RawEdgeData }>;
    };
    properties?: { [key: string]: any };
}

export interface RawNodeData extends NodeDataDefinition {
    id: string;
    labels: string[];
    properties: { 
        name: string,
        shortname: string;
        simpleName: string;
        kind: string;
        sourceText?: string;
        [key: string]: any; 
    };
}
export interface RawEdgeData extends EdgeDataDefinition {
    label: string;
    labels?: string[];
    properties?: { [key: string]: any };
}

export interface EdgeData extends RawEdgeData {
    interaction: string;
    group: string;
}

export interface NodeData extends RawNodeData {
    label: string;
}

export interface GraphData {
    elements: {
        nodes: Array<{ data: NodeData }>;
        edges: Array<{ data: EdgeData }>;
    };
    properties?: { [key: string]: any };
}


/**
 * This class is responsible for preprocessing the graph data before it is used in the application. 
 * It ensures that the graph data adheres to the expected contract, upgrades older schema versions to the latest version, 
 * and makes the uploaded graph richer with extra added fields.
 */
export class GraphPreprocessor {

    private graphAbstractizer: GraphAbtractizer = new GraphAbtractizer();
    private graphValidator: GraphValidator = new GraphValidator();

    public prepareGraph(graphData: unknown, source = 'graph input'): Graph {
        this.graphValidator.assertRawGraphContract(graphData, source);

        // Create a deep clone of graphData
	    const originalGraph: RawGraphData = JSON.parse(JSON.stringify(graphData));
        
        const schemaVersion = this.determineSchemaVersion(originalGraph);
        console.log('schema version', schemaVersion);
        
        let normalizedGraph = schemaVersion.startsWith('2.0') ? originalGraph : this.upgradeV1ToV2(originalGraph);
        normalizedGraph = this.addMissingFieldInstantiateEdges(normalizedGraph)

        // TODO Consider removing old schema version support, since it they cant be abstracted anyway
        const abstractGraph: RawGraphData = (schemaVersion.startsWith('2.0') || schemaVersion.startsWith('1.2')) ?
                this.graphAbstractizer.abstractizeV2(normalizedGraph) : normalizedGraph;
        const abstractGraphWithExtraFields: GraphData = this.addFieldsToAbstractGraph(abstractGraph);
        
        const graph = {
            original: originalGraph,
            abstract: abstractGraphWithExtraFields,
            coloringMeta: this.buildColoringMeta(normalizedGraph),
        };

        this.graphValidator.assertPreparedGraphContract(graph, source);
        
        return graph;
    };

    private addFieldsToAbstractGraph(graph: RawGraphData): GraphData {
        const nodes = graph.elements.nodes.map(node => {
            const { name, shortname, simpleName } = node.data.properties;
            const simple = name || shortname || simpleName;
            return { data: {...node.data, name: simple, label: simple,} };
        })

        const edges = graph.elements.edges.map(edge => {
            return { data: { ...edge.data, interaction: edge.data.label, group: edge.data.label} };
        })

        return {
            elements: { nodes, edges },
            properties: graph.properties
        };
    }

    private determineSchemaVersion(graphData: RawGraphData) {
        if (graphData.properties && graphData.properties.schemaVersion) {
            return graphData.properties.schemaVersion;
        }
        const nodeLabels = this.collectUniqueNodeLabels(graphData.elements.nodes);
        const graphContainsScripts = nodeLabels.some(label => ['Operation', 'Constructor', 'Script'].includes(label));
        if (graphContainsScripts) {
            return '1.2.0';
        }
        return '1.0.0';
    };
    
    private upgradeV1ToV2(graphData: RawGraphData): RawGraphData {
        const newGraphData: RawGraphData = JSON.parse(JSON.stringify(graphData));
        newGraphData.elements.nodes.forEach((node) => {
            if (node.data.labels.includes('Container')) {
                node.data.labels.push('Scope');
                node.data.labels.splice(node.data.labels.indexOf('Container'), 1);
            }
            if (node.data.labels.includes('Structure')) {
                node.data.labels.push('Type');
                node.data.labels.splice(node.data.labels.indexOf('Structure'), 1);
            }
            if (node.data.labels.includes('Grouping')) {
                node.data.labels.push('Category');
                node.data.labels.splice(node.data.labels.indexOf('Grouping'), 1);
            }
            if (node.data.labels.includes('Script')) {
                if (!node.data.labels.includes('Operation')) {
                    node.data.labels.push('Operation');
                }
                node.data.labels.splice(node.data.labels.indexOf('Script'), 1);
            }
            if (node.data.labels.includes('Constructor')) {
                if (!node.data.labels.includes('Operation')) {
                    node.data.labels.push('Operation');
                }
                node.data.labels.splice(node.data.labels.indexOf('Constructor'), 1);
                node.data.properties['kind'] = "constructor";
            }
            if (node.data.labels.includes('Primitive')) {
                if (!node.data.labels.includes('Type')) {
                    node.data.labels.push('Type');
                }
                node.data.labels.splice(node.data.labels.indexOf('Primitive'), 1);
                node.data.properties['kind'] = "primitive";
            }
        });
        newGraphData.elements.edges.forEach((edge) => {
            if (edge.data.label === 'contains') {
                edge.data.label = 'encloses';
            }
            if (edge.data.label === 'hasScript') {
                edge.data.label = 'encapsulates';
            }
            if (edge.data.label === 'hasVariable') {
                edge.data.label = 'encapsulates';
            }
            if (edge.data.label === 'hasParameter') {
                const src = edge.data.source;
                const tgt = edge.data.target;
                edge.data.source = tgt;
                edge.data.target = src;
                edge.data.label = 'parameterizes';
            }
            if (edge.data.label === 'returnType') {
                edge.data.label = 'returns';
            }
            if (edge.data.label === 'type') {
                edge.data.label = 'typed';
            }
            if (edge.data.label === 'allowedDependency') {
                edge.data.label = 'succeeds';
            }
        });
        return newGraphData;
    };

    /**
     * This method is intended to be a temporary quick fix. It adds missing field instantiates edges that are not listed in the json, but should be.
     * Ideally the json should be fixed externally, and the current json generation tool (javapers) should be updated.
     */
    private addMissingFieldInstantiateEdges(graphData: RawGraphData): RawGraphData {
        const newGraphData: RawGraphData = JSON.parse(JSON.stringify(graphData));
        const fields = newGraphData.elements.nodes.filter((node) => node.data.properties.kind === "field");
        const fieldWithInit = fields.filter((field) => field.data.properties.sourceText?.includes("= new"))

        // Find constructor call
        fieldWithInit.forEach((field) => {
            const type = field.data.properties.sourceText?.split("= new")[1].slice(1, -3)  // Grab the part after new and remove the last 3 chars '();' to get the type
            if (!type) { return; }
            
            const nodesWithTypeInName = newGraphData.elements.nodes.filter((node) => node.data.id.includes(type) && node.data.labels.includes("Type"))
            const isConstructorCall = nodesWithTypeInName.length > 0;
            if (!isConstructorCall) { return; }

            // Get typed edges, since constructor call must have the same type
            // const edges = newGraphData.elements.edges.filter((edge) => edge.data.source === field.data.id && edge.data.label === "typed")
            // if (edges.length !== 1) {
            //     return;
            // }

            // const nodes = newGraphData.elements.nodes.filter((node) => node.data.id === edges[0].data.target)
            // if (nodes.length !== 1) {
            //     throw Error("Cannot happen. Each id exists at most once. Either the id doesnt exist or the id is not unique");
            // }

            // Found missing instantiates instance
            const newEdge = {
                data: {
                    label: 'instantiates',
                    source: field.data.id,
                    target: nodesWithTypeInName[0].data.id,
                    properties: {
                        weight: 1,
                        metaSrc: "source code",
                    }
                }
            }
            newGraphData.elements.edges.push(newEdge)
            console.warn(`Missing instantiates edge added for field ${field.data.id} with sourceText ${field.data.properties.sourceText}`)

        })
        return newGraphData
    }

    private buildColoringMeta(graphData: RawGraphData): { nodes: Array<{ data: RawNodeData }>; edges: Array<{ data: RawEdgeData }> } {
        const nodesById: Map<string, RawNodeData> = new Map((graphData.elements.nodes || []).map((node) => [node.data.id, node.data]));
        const relevantEdges: RawEdgeData[] = (graphData.elements.edges || [])
            .map((edge) => edge.data)
            .filter((edge) => ['composes', 'implements', 'succeeds'].includes(edge.label));

        const includedNodeIds: Set<string> = new Set();
        for (const edge of relevantEdges) {
            includedNodeIds.add(edge.source);
            includedNodeIds.add(edge.target);
        }

        for (const node of graphData.elements.nodes || []) {
            const labels = node.data?.labels || [];
            if (labels.includes('Dimension') || labels.includes('Category')) {
                includedNodeIds.add(node.data.id);
            }
        }

        const nodes: { data: RawNodeData }[] = [...includedNodeIds]
            .map((id) => nodesById.get(id))
            // .filter(Boolean)
            .filter((node): node is RawNodeData => node !== undefined)
            .map((node) => ({ data: { ...node } }));

        const edges: { data: RawEdgeData }[] = relevantEdges.map((edge) => ({ data: { ...edge } }));

        return { nodes, edges };
    }

    private collectUniqueNodeLabels(nodeList: Array<{ data: RawNodeData }>): string[] {
        return Array.from(
            new Set(nodeList.flatMap(node => node.data?.labels || []))
        );
    }
}