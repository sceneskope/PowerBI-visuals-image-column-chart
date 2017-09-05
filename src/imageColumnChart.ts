module powerbi.extensibility.visual {
    import tooltip = powerbi.extensibility.utils.tooltip;
    import axisUtils = powerbi.extensibility.utils.chart.axis;
    import formatting = powerbi.extensibility.utils.formatting;
    import type = powerbi.extensibility.utils.type;
    import svgUtils = powerbi.extensibility.utils.svg;
    import interactivity = powerbi.extensibility.utils.interactivity;

    export class ImageColumnChart implements IVisual {
        private static readonly NullPrimitive = (null as any) as d3.Primitive;
        private static readonly Chart = svgUtils.CssConstants.createClassAndSelector("chart");
        private static readonly Axes = svgUtils.CssConstants.createClassAndSelector("axes");
        private static readonly Axis = svgUtils.CssConstants.createClassAndSelector("axis");
        private static readonly XAxis = svgUtils.CssConstants.createClassAndSelector("xAxis");
        private static readonly YAxis = svgUtils.CssConstants.createClassAndSelector("yAxis");
        private static readonly Legends = svgUtils.CssConstants.createClassAndSelector("legends");
        private static readonly ClassName = "imageColumnChart";

        private static readonly Config = {
            minWidth: 100,
            minHeight: 100,
            xScalePadding: 0.1,
            solidOpacity: 1,
            transparentOpacity: 0.5,
            minMargins: {
                top: 0,
                right: 0,
                bottom: 50,
                left: 0,
            },
            xAxisFontMultiplier: 0.04,
            yAxisFontMultiplier: 0.04,
            maxMarginFactor: 0.25,
            marginTopFactor: 2,
            minCategoryAxisHeight: 20,
            minValueAxisWidth: 30,
        };

        private viewportIn: IViewport;
        private viewport: IViewport;
        private dataViews: DataView[];
        private xScale: d3.scale.Ordinal<any, any>;
        private yScale: d3.scale.Ordinal<any, any>;
        private defs: d3.Selection<SVGDefsElement>;

        private readonly behavior: Behavior;
        private readonly interactivityService: interactivity.IInteractivityService;
        private readonly legend: d3.Selection<SVGGElement>;
        private readonly axes: d3.Selection<SVGGElement>;
        private readonly main: d3.Selection<SVGGElement>;
        private readonly clearCatcher: d3.Selection<SVGGElement>;
        private readonly rootElement: d3.Selection<HTMLDivElement>;
        private readonly xAxis: d3.Selection<SVGGElement>;
        private readonly yAxis: d3.Selection<SVGGElement>;
        private readonly tooltipServiceWrapper: tooltip.ITooltipServiceWrapper;
        private readonly host: IVisualHost;
        private model?: Model;
        private readonly chart: d3.Selection<SVGGElement>;

        constructor(options: VisualConstructorOptions) {
            this.host = options.host;
            this.tooltipServiceWrapper = tooltip.createTooltipServiceWrapper(
                options.host.tooltipService, options.element);

            const rootElement = this.rootElement = d3.select(options.element)
                .append("svg")
                .classed(ImageColumnChart.ClassName, true);

            this.interactivityService = interactivity.createInteractivityService(options.host);
            this.behavior = new Behavior();

            this.clearCatcher = interactivity.appendClearCatcher(rootElement);
            const main = this.main = rootElement.append("g");
            this.chart = main.append("g").classed(ImageColumnChart.Chart.className, true);
            this.axes = main.append("g").classed(ImageColumnChart.Axes.className, true);
            this.xAxis = this.axes
                .append("g")
                .classed(ImageColumnChart.Axis.className, true)
                .classed(ImageColumnChart.XAxis.className, true);
            this.yAxis = this.axes
                .append("g")
                .classed(ImageColumnChart.Axis.className, true)
                .classed(ImageColumnChart.YAxis.className, true);
            this.legend = this.main
                .append("g")
                .classed(ImageColumnChart.Legends.className, true);
            this.defs = rootElement.append("defs");
        }

        private clearViewport() {
            [this.xAxis, this.yAxis, this.legend, this.chart].forEach(s => this.clearElement(s));
        }

        private setSize(viewport: IViewport) {
            this.viewport = viewport;
            const transform = svgUtils.translate(0, 0);
            this.rootElement
                .attr("width", viewport.width)
                .attr("height", viewport.height);

            this.main.attr("transform", transform);
            this.legend.attr("transform", transform);
        }

        private updateViewportIn(widthOfValueAxis: number, heightOfCategoryAxis: number, labelHeight: number) {
            const width = this.viewport.width - widthOfValueAxis;
            const height = this.viewport.height - heightOfCategoryAxis - labelHeight;
            this.viewportIn = { height: height, width: width };
        }

        private static getTextProperties(pointSize: number, text?: string): formatting.TextProperties {
            return {
                fontFamily: "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif",
                fontSize: type.PixelConverter.fromPoint(pointSize),
                text: text
            };
        }

        private clearElement(selection: d3.Selection<any>) {
            selection
                .selectAll("*")
                .remove();
        }

        private transformChartAndAxes(xAdjust: number, yAdjust: number) {
            const offsetToRightAndDown = svgUtils.translate(xAdjust, yAdjust);
            this.chart.attr("transform", offsetToRightAndDown);
            this.axes.attr("transform", offsetToRightAndDown);
            this.xAxis.attr("transform", svgUtils.translate(0, this.viewportIn.height));
            this.yAxis.attr("transform", svgUtils.translate(0, 0));
        }

        private calculateLabelWidth(value: PrimitiveValue, formatter: formatting.IValueFormatter, fontSize: number) {
            const label = formatter.format(value);
            const properties = ImageColumnChart.getTextProperties(fontSize, label);
            return formatting.textMeasurementService.measureSvgTextWidth(properties);
        }

        private calculateLabelHeight(value: PrimitiveValue, formatter: formatting.IValueFormatter, fontSize: number) {
            const label = formatter.format(value);
            const properties = ImageColumnChart.getTextProperties(fontSize, label);
            return formatting.textMeasurementService.measureSvgTextHeight(properties);
        }

        private updateAxes(model: Model) {
            const widthOfValueLabel = model.settings.valueAxis.show
                ? ImageColumnChart.Config.minValueAxisWidth + Math.max(
                    this.calculateLabelWidth(model.minY, model.valueLabelFormatter, model.settings.valueAxis.fontSize),
                    this.calculateLabelWidth(model.maxY, model.valueLabelFormatter, model.settings.valueAxis.fontSize))
                : 0;

            const labelHeight = this.calculateLabelHeight("Ag",
                model.categoryLabelFormatter, model.settings.categoryAxis.fontSize);

            const heightOfCategoryLabel = model.settings.categoryAxis.show
                ? ImageColumnChart.Config.minCategoryAxisHeight + labelHeight
                : 0;

            this.updateViewportIn(widthOfValueLabel, heightOfCategoryLabel, labelHeight);
            this.transformChartAndAxes(widthOfValueLabel, labelHeight);

            const yAxis = axisUtils.createAxis({
                pixelSpan: this.viewportIn.height,
                dataDomain: [model.minY, model.maxY],
                metaDataColumn: model.valueMetadata,
                formatString: formatting.valueFormatter.getFormatStringByColumn(model.valueMetadata),
                outerPadding: 0.5,
                isVertical: true,
                isScalar: true,
                useTickIntervalForDisplayUnits: true,
                isCategoryAxis: false,
                scaleType: axisUtils.scale.linear,
                getValueFn: i => i,
                is100Pct: true,
                categoryThickness: 1,
                shouldClamp: true
            });
            this.yScale = yAxis.scale;

            if (model.settings.valueAxis.show) {
                const axis = yAxis.axis
                    .tickFormat(i => model.valueLabelFormatter.format(i));

                this.yAxis
                    .attr("font-size", type.PixelConverter.fromPointToPixel(model.settings.valueAxis.fontSize))
                    .call(axis);
            } else {
                this.clearElement(this.yAxis);
            }

            const xAxis = axisUtils.createAxis({
                pixelSpan: this.viewportIn.width,
                dataDomain: model.dataPoints.map((_, i) => i),
                metaDataColumn: model.categoryMetadata,
                formatString: formatting.valueFormatter.getFormatStringByColumn(model.categoryMetadata),
                getValueFn: i => model.dataPoints[i].category,
                outerPadding: 0.5,
                isVertical: false,
                isScalar: false,
                isCategoryAxis: true,
                is100Pct: true,
            });
            this.xScale = xAxis.scale;

            if (model.settings.categoryAxis.show) {
                const textProperties = ImageColumnChart.getTextProperties(model.settings.categoryAxis.fontSize);
                const willFit = axisUtils.LabelLayoutStrategy.willLabelsFit(xAxis,
                    this.viewportIn.width,
                    utils.formatting.textMeasurementService.measureSvgTextWidth,
                    textProperties
                );
                const textSelectors = this.xAxis
                    .attr("font-size", type.PixelConverter.fromPointToPixel(model.settings.categoryAxis.fontSize))
                    .call(xAxis.axis)
                    .selectAll("text");

                if (!willFit) {
                    textSelectors
                        .style("text-anchor", "end")
                        .attr("dx", "-0.5em")
                        .attr("transform", "rotate(-35)");

                } else {
                    textSelectors
                        .style("text-anchor", "middle")
                        .attr("dx", ImageColumnChart.NullPrimitive)
                        .attr("transform", ImageColumnChart.NullPrimitive);

                }

            } else {
                this.clearElement(this.xAxis);
            }
        }

        public update(options: VisualUpdateOptions) {
            this.dataViews = options.dataViews;
            try {
                if (!options
                    || !options.dataViews
                    || !options.dataViews[0]) {
                    this.clearViewport();
                    return;
                }

                const config = ImageColumnChart.Config;
                if ((options.viewport.width < config.minWidth)
                    || (options.viewport.height < config.minHeight)) {
                    this.clearViewport();
                    return;
                }

                this.setSize(options.viewport);
                const dataView = this.dataViews[0];

                this.model = visualTransform(dataView, this.host);
                if (!this.model) {
                    this.clearViewport();
                    return;
                }

                this.updateAxes(this.model);
                this.renderChart(this.model);
            }
            catch (ex) {
                console.error("Caught", ex);
            }
        }

        private renderChart(model: Model) {
            const dataPoints = model.dataPoints;

            const columnWidth = this.xScale.rangeBand();
            const imageWidth = columnWidth * 4;
            const imageHeight = (imageWidth / 1024) * 768;

            if (model.settings.enableImages.show) {
                const patterns = this.defs.selectAll("pattern").data(dataPoints);
                patterns.enter()
                    .append("pattern")
                    .attr("patternUnits", "userSpaceOnUse")
                    .attr("width", imageWidth)
                    .attr("height", imageHeight)
                    .attr("id", d => `bg-${d.category}`)
                    .append("image")
                    .attr("xlink:href", d => d.imageUrl!)
                    .attr("width", imageWidth)
                    .attr("height", imageHeight);

                patterns.exit()
                    .remove();
            }

            const columns = this.chart.selectAll(".column")
                .data(dataPoints);

            columns.enter()
                .append("rect")
                .classed("column", true);

            columns.attr({
                width: columnWidth,
                height: d => this.viewportIn.height - this.yScale(d.value as number),
                y: d => this.yScale(d.value as number),
                x: (_, i) => this.xScale(i)

            });

            if (model.settings.enableImages.show) {
                columns
                    .attr("fill", d => `url(#bg-${d.category})`)
                    .attr("fill-opacity", model.settings.generalView.opacity / 100);
            }
            else {
                columns
                    .attr("fill", d => d.color)
                    .attr("fill-opacity", model.settings.generalView.opacity / 100);
            }

            this.bindSelectionHandler(columns);
            this.tooltipServiceWrapper.addTooltip<tooltip.TooltipEnabledDataPoint>(
                this.chart, tte => tte.data.tooltipInfo!);
        }
        private bindSelectionHandler(columns: d3.selection.Update<DataPoint>) {
            if (!this.model) {
                return;
            }

            const options = {
                columns,
                clearCatcher: this.clearCatcher,
                interactivityService: this.interactivityService
            };
            this.interactivityService.bind(this.model.dataPoints, this.behavior, options);
        }

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions)
            : VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
            const settings = this.model && this.model.settings || Settings.getDefault() as Settings;
            const instanceEnumeration = Settings.enumerateObjectInstances(settings, options);
            return instanceEnumeration;
        }

        /**
         * Enumerates through the objects defined in the capabilities and adds the properties to the format pane
         *
         * @function
         * @param {EnumerateVisualObjectInstancesOptions} options - Map of defined objects
         */
        // public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions)
        // : VisualObjectInstanceEnumeration {
        //     let objectName = options.objectName;
        //     let objectEnumeration: VisualObjectInstance[] = [];

        //     switch (objectName) {
        //         case "enableImages":
        //             objectEnumeration.push({
        //                 objectName: objectName,
        //                 properties: {
        //                     show: this.chartSettings.enableImages.show,
        //                 },
        //                 selector: null
        //             });
        //             break;
        //         case "enableAxis":
        //             objectEnumeration.push({
        //                 objectName: objectName,
        //                 properties: {
        //                     show: this.chartSettings.enableAxis.show,
        //                 },
        //                 selector: null
        //             });
        //             break;
        //         case "colorSelector":
        //             for (const dataPoint of this.dataPoints) {
        //                 objectEnumeration.push({
        //                     objectName: objectName,
        //                     displayName: dataPoint.category,
        //                     properties: {
        //                         fill: {
        //                             solid: {
        //                                 color: dataPoint.color
        //                             }
        //                         }
        //                     },
        //                     selector: dataPoint.selectionId
        //                 });
        //             }
        //             break;
        //         case "generalView":
        //             objectEnumeration.push({
        //                 objectName: objectName,
        //                 properties: {
        //                     opacity: this.chartSettings.generalView.opacity,
        //                 },
        //                 validValues: {
        //                     opacity: {
        //                         numberRange: {
        //                             min: 10,
        //                             max: 100
        //                         }
        //                     }
        //                 },
        //                 selector: null
        //             });
        //             break;
        //     }

        //     return objectEnumeration;
        // }

        /**
         * Destroy runs when the visual is removed. Any cleanup that the visual needs to
         * do should be done here.
         *
         * @function
         */
        public destroy(): void {
            // Perform any cleanup tasks here
        }

        // private getTooltipData(value: any): VisualTooltipDataItem[] {
        //     return [{
        //         displayName: value.category,
        //         value: this.formatter.format(value.value),
        //         color: value.color
        //     }];
        // }
    }
}
