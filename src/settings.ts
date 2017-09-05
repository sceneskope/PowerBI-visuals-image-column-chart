module powerbi.extensibility.visual {
  import DataViewObjectsParser = powerbi.extensibility.utils.dataview.DataViewObjectsParser;

  export class Settings extends DataViewObjectsParser {
    public categoryAxis = new CategoryAxisSettings();
    public valueAxis = new ValueAxisSettings();
    public enableImages = new ImageSettings();
    public generalView = new GeneralSettings();
  }

  export class CategoryAxisSettings {
    public show = true;
    public showAxisTitle = false;
    public displayUnits: number = 0;
    public precision: number = 2;
    public title = "";
    public color = "";
    public fontSize = 12;
  }

  export class ValueAxisSettings {
    public show = true;
    public showAxisTitle = false;
    public maxValue: number | null = null;
    public minValue: number | null = null;
    public displayUnits: number = 0;
    public precision: number = 2;
    public title = "";
    public color = "";
    public fontSize = 12;
  }

  export class ImageSettings {
    public show = true;
  }

  export class GeneralSettings {
    public opacity = 100;
  }

}
