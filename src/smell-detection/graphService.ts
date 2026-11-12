import cytoscape from "cytoscape";
// @ts-ignore
import { nodeHasLabel } from '../utilities/utils.js';

export class GraphService {
    private static DFS1(u: number, adj: { [key: number]: number[] }, visited: boolean[], st: number[]) {
        visited[u] = true;
        for (let v of adj[u]) {
            if (!visited[v]) this.DFS1(v, adj, visited, st);
        }
        st.push(u);
    }

    // DFS on reversed graph to collect SCC
    private static DFS2(u: number, revAdj: { [key: number]: number[] }, visited: boolean[], scc: number[]) {
        visited[u] = true;
        scc.push(u);
        for (let v of revAdj[u]) {
            if (!visited[v]) this.DFS2(v, revAdj, visited, scc);
        }
    }

    // Used https://www.geeksforgeeks.org/dsa/strongly-connected-components/ for strongly connected components algorithm (Kosaraju's algorithm)
    private static kosaraju(number_of_nodes: number, adj: { [key: number]: number[] }): number[][] {
        let visited = Array(number_of_nodes).fill(false);
        let st: number[] = [];

        // Fill stack with finish time order
        for (let i = 0; i < number_of_nodes; i++) {
            if (!visited[i]) this.DFS1(i, adj, visited, st);
        }

        // Reverse the graph
        let revAdj: { [key: number]: number[] } = Array.from({ length: number_of_nodes }, () => []);
        for (let u: number = 0; u < number_of_nodes; u++) {
            for (let v of adj[u]) {
                revAdj[v].push(u);
            }
        }

        // Process reversed graph in order of stack
        visited.fill(false);
        let SCCs: number[][] = [];

        while (st.length > 0) {
            let u: number | undefined = st.pop();
            if (u && !visited[u]) {
                let scc: number[] = [];
                this.DFS2(u, revAdj, visited, scc);
                SCCs.push(scc);
            }
        }

        return SCCs;
    }

    public static createAdjacencyList(number_of_nodes: number, edges: [number, number][]): { [key: number]: number[] } {
        let adj: { [key: number]: number[] } = Array.from({ length: number_of_nodes }, () => []);
        for (let [u, v] of edges) {
            adj[u].push(v);
        }
        return adj;
    }

    /** Nodes (and thus edges!) must start from index 1 and be sequential */
    public static getStronglyConnectedComponents(number_of_nodes: number, edges: [number, number][]): number[][] {
        const adj = this.createAdjacencyList(number_of_nodes + 1, edges);
        const SCCs = this.kosaraju(number_of_nodes + 1, adj);
        
        console.log("Strongly Connected Components:");
        const result = []
        for (let i = 0; i < SCCs.length; i++) {
            if (SCCs[i].length > 1) {
                result.push(SCCs[i]);
                console.log(SCCs[i].join(" "));
            }
        }
        return result;
    }

    private static findShortestPaths(num_nodes: number, edges: [number, number][], self_search: number): number[][] {
        let visited = new Array(num_nodes).fill(false);
        edges = edges.filter((e) => e[0] !== e[1]);
        
        const adj = this.createAdjacencyList(num_nodes + 1, edges)

        let path: number[] | undefined = [self_search]
        let queue: number[][] = [path.slice()];
        const results: number[][] = []
        while (queue.length !== 0) {
            const depth = path.length;
            path = queue.shift();
            if (path === undefined) {throw Error("queue is empty")}
            let last = path[path.length - 1]

            if (results.length > 0 && depth > results[0].length) {
                break; // Dont find longer paths
            }
            
            for (let n of adj[last]) {
                if (!visited[n]) {
                    visited[n] = true;
                    if (n === self_search) {
                        console.log("found", self_search, path)
                        results.push(path)
                        visited[n] = false; // Dont mark self_search as visited so other paths can be found
                    }
                    let newPath = path.slice();
                    newPath.push(n)
                    queue.push(newPath);
                }
            }
        }
        return results
    }

    /** 
     * Get subcycles in a strongly connected components (scc)
     * For each node in the scc it finds the shortest path back to itself
     * @param limit the maximum number of cycles to seach (early stopping condition)
    */
    public static getSmallestSubCycles(num_nodes: number, edges: [number, number][], scc: number[], limit: number) {
        const cyclesAreEqual = (cycle1: number[], cycle2: number[]) => {
            if (cycle1.length !== cycle2.length) return false;
            if (cycle1.length === 0) return true;

            // Double the first cycle to capture all possible rotations
            const doubled = cycle1.concat(cycle1).join(',');
            const target = cycle2.join(',');
            return doubled.includes(target);
        }

        const result: number[][] = []
        // const uniquePaths = new Set<string>(); 
        for (let i=0; i<scc.length; i++){
            for (let path of this.findShortestPaths(num_nodes, edges, scc[i])) {
                if (result.some((p) => cyclesAreEqual(p, path))) {continue}
                result.push(path)
            }

            if (result.length > limit) {
                break;
            }
        }


        // const testEdges: [number, number][] = [
        //     [1, 3],
        //     [2, 1],
        //     [3, 2],
        //     [3, 4],
        //     [4, 6],
        //     [6, 3],
        //     [6, 7],
        //     [4, 5],
        // ]
        // this.findShortestPaths(7, testEdges, 3)
        // assert test case that both cycles of size 3 are returned
        return result.slice(0, limit)

    }
};

export class CytoscapeToNumericAdapter {
    public static getEdges(cytoscape: cytoscape.Core): [[number, number][], {[key: string]: number}, {[key: string]: string}, number] {
        const cyToNumMapping: {[key: string]: number} = {};
        const numToCyMapping: {[key: string]: string} = {};
        let k = 1;
        cytoscape.nodes().forEach((node) => {
            if (nodeHasLabel(node, 'Type')) {
                numToCyMapping[k] = node.id();
                cyToNumMapping[node.id()] = k;
                k += 1;
            };
        })

        const problematic_interactions = ['calls', 'holds', 'accepts', 'produces'];
        const edges = cytoscape.edges()
            .filter((e) => problematic_interactions.includes(e.data("label")) && cyToNumMapping.hasOwnProperty(e.source().id()) && cyToNumMapping.hasOwnProperty(e.target().id())).edges()
            .map(edge => [cyToNumMapping[edge.source().id()], cyToNumMapping[edge.target().id()]] as [number, number]);

        
        // Remove duplicates
        const edgesUnique: [number, number][] = [];
        const found = new Set()
        edges.forEach((edge) => {
            const edgeId = edge[0] + "-" + edge[1];
            if (!found.has(edgeId)) {
                edgesUnique.push(edge)
                found.add(edgeId)
            }
        })
        return [edgesUnique, cyToNumMapping, numToCyMapping, k];
    }
}
