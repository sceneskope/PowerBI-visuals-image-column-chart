module powerbi.extensibility.visual {
    import interactivity = powerbi.extensibility.utils.interactivity;

    export interface BehaviorOptions {
        columns: d3.Selection<DataPoint>;
        clearCatcher: d3.Selection<any>;
        interactivityService: interactivity.IInteractivityService;
    }

    export class Behavior implements interactivity.IInteractiveBehavior {
        private columns: d3.Selection<DataPoint>;
        private clearCatcher: d3.Selection<any>;
        private interactivityService: interactivity.IInteractivityService;

        public bindEvents(behaviorOptions: BehaviorOptions, selectionHandler: interactivity.ISelectionHandler) {
            this.columns = behaviorOptions.columns;
            this.interactivityService = behaviorOptions.interactivityService;
            this.clearCatcher = behaviorOptions.clearCatcher;

            this.columns.on("click", (dataPoint: DataPoint) =>
                selectionHandler.handleSelection(dataPoint, true));

            this.clearCatcher.on("click", () => this.interactivityService.clearSelection());
        }

        public renderSelection(hasSelection: boolean) {
            const serviceSelection = this.interactivityService.hasSelection();
            this.columns
                .attr("fill-opacity", dp => {
                    if (!serviceSelection || !hasSelection || dp.selected) {
                        return 1.0;
                    } else {
                        return 0.4;
                    }
                });
        }
    }
}
