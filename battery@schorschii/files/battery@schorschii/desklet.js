const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const Util = imports.misc.util;
const Cinnamon = imports.gi.Cinnamon;
const Mainloop = imports.mainloop;
const Lang = imports.lang;
const Settings = imports.ui.settings;

function MyDesklet(metadata, desklet_id) {
	this._init(metadata, desklet_id);
}

function main(metadata, desklet_id) {
	return new MyDesklet(metadata, desklet_id);
}

MyDesklet.prototype = {
	__proto__: Desklet.Desklet.prototype,

	_init: function(metadata, desklet_id) {
		Desklet.Desklet.prototype._init.call(this, metadata);

		// initialize settings
		this.settings = new Settings.DeskletSettings(this, this.metadata["uuid"], desklet_id);
		this.settings.bind("devfile_capacity", "devfile_capacity", this.on_setting_changed);
		this.settings.bind("devfile_status", "devfile_status", this.on_setting_changed);
		this.settings.bind("showpercent", "showpercent", this.on_setting_changed);
		this.settings.bind("showplug", "showplug", this.on_setting_changed);
		this.settings.bind("hide-decorations", "hide_decorations", this.on_setting_changed);
		this.settings.bind("use-custom-label", "use_custom_label", this.on_setting_changed);
		this.settings.bind("custom-label", "custom_label", this.on_setting_changed);

		// initialize desklet gui
		this.setupUI();
	},

	setupUI: function() {
		// create elements
		this.battery = new St.Bin({style_class: 'battery green'}); // background
		this.segment = new St.Bin({style_class: 'segment'}); // variable width bar (indicates capacity)
		this.container = new St.Group({style_class: 'container'}); // container for icon and label
		this.plug = new St.Bin({style_class: 'plug'}); // plug/warn icon
		this.text = new St.Label({style_class: 'text'}); // displays capacity in precent

		// add actor
		this.battery.add_actor(this.segment);
		this.segment.add_actor(this.container);
		this.container.add_actor(this.plug);
		this.container.add_actor(this.text);

		// set root eleent
		this.setContent(this.battery);

		// set decoration settings
		this.refreshDecoration();

		// set initial values
		this.refresh();
	},

	refresh: function() {
		// default device files
		var default_devfile_capacity_1 = "/sys/class/power_supply/CMB1/capacity"; // kernel 3.x
		var default_devfile_status_1 = "/sys/class/power_supply/CMB1/status";
		var default_devfile_capacity_2 = "/sys/class/power_supply/BAT0/capacity"; // kernel 4.x
		var default_devfile_status_2 = "/sys/class/power_supply/BAT0/status";
		var default_devfile_capacity_3 = "/sys/class/power_supply/BAT1/capacity";
		var default_devfile_status_3 = "/sys/class/power_supply/BAT1/status";

		// get device files from settings
		// remove "file://" because it's not supported by Cinnamon.get_file_contents_utf8_sync()
		var result_devfile_capacity = this.devfile_capacity.replace("file://", "");
		var result_devfile_status = this.devfile_status.replace("file://", "");

		// auto detect device files if settings were not set
		if (result_devfile_capacity == "") {
			try {
				Cinnamon.get_file_contents_utf8_sync(default_devfile_capacity_1);
				result_devfile_capacity = default_devfile_capacity_1;
			} catch(ex) {
				try {
					Cinnamon.get_file_contents_utf8_sync(default_devfile_capacity_2);
					result_devfile_capacity = default_devfile_capacity_2;
				} catch(ex) {
					result_devfile_capacity = default_devfile_capacity_3;
				}
			}
		}
		if (result_devfile_status == "") {
			try {
				Cinnamon.get_file_contents_utf8_sync(default_devfile_status_1);
				result_devfile_status = default_devfile_status_1;
			} catch(ex) {
				try {
					Cinnamon.get_file_contents_utf8_sync(default_devfile_status_2);
					result_devfile_status = default_devfile_status_2;
				} catch(ex) {
					result_devfile_status = default_devfile_status_3;
				}
			}
		}

		// get current battery/power supply values
		var currentCapacity = 0;
		var currentState = "";
		var currentError = 0;
		try {
			// read device files
			currentCapacity = parseInt(Cinnamon.get_file_contents_utf8_sync(result_devfile_capacity));
			currentState = Cinnamon.get_file_contents_utf8_sync(result_devfile_status).trim();
		} catch(ex) {
			// maybe the file does not exist because the battery was removed
			currentError = 1;
		}

		// set label text to current capacity
		this.text.set_text(currentCapacity.toString() + "%");

		if (currentCapacity > 95) {
			// 95%-100%: show fixed full background and hide bar
			this.battery.style_class = "battery full";
			this.segment.style = "background-size: 0px 0px;";
		} else if (currentCapacity > 20) {
			// greater than 20%: show green background and a bar with variable length

			// calc bar width
			this.batterySegmentMaxLength = 115;
			this.batterySegmentLength = this.batterySegmentMaxLength * currentCapacity / 100;

			// set background and bar width
			this.battery.style_class = "battery green";
			this.segment.style = "background-size: " + this.batterySegmentLength.toString() + "px 66px;"
		} else if (currentCapacity > 10) {
			// greater than 10% but lower than 21%: show fixed red background and hide bar
			this.battery.style_class = "battery red";
			this.segment.style = "background-size: 0px 0px;";
		} else if (currentCapacity > 0) {
			// greater than 0% but lower than 11%: show fixed low red background and hide bar
			this.battery.style_class = "battery red-low";
			this.segment.style = "background-size: 0px 0px;";
		} else if (currentCapacity == 0) {
			// exactly 0%: show fixed empty background and hide bar
			this.battery.style_class = "battery empty";
			this.segment.style = "background-size: 0px 0px;";
		}

		// icon or label visibility decision
		if (currentError == 1) {
			// error: warning icon and no label
			this.plug.style_class = "symbol warn";
			this.text.style_class = "text text-hidden";
		} else {
			if (currentState == "Charging" && this.showplug == true) {
				// power supply online, charging and icon should be shown
				this.plug.style_class = "symbol flash";
				this.text.style_class = "text text-hidden";
			} else if ((currentState == "Not charging" || currentState == "Full" || currentState == "Unknown") && this.showplug == true) {
				// power supply online, not charging (full) and icon should be shown
				this.plug.style_class = "symbol plug";
				this.text.style_class = "text text-hidden";
			} else if (this.showpercent == true) {
				// power supply offline (= discharging) and capacity should be shown
				this.plug.style_class = "symbol hidden";
				this.text.style_class = "text";
			} else if (this.showpercent == false) {
				// power supply offline (= discharging) and capacity should not be shown
				this.plug.style_class = "symbol hidden";
				this.text.style_class = "text text-hidden";
			} else {
				// Unknown state
				this.plug.style_class = "symbol warn";
				this.text.style_class = "text text-hidden";
			}
		}

		// refresh again in two seconds
		this.timeout = Mainloop.timeout_add_seconds(2, Lang.bind(this, this.refresh));
	},

	refreshDecoration: function() {
		// desklet label (header)
		if (this.use_custom_label == true)
			this.setHeader(this.custom_label)
		else
			this.setHeader(_("Battery"));

		// prevent decorations?
		this.metadata["prevent-decorations"] = this.hide_decorations;
		this._updateDecoration();
	},

	on_setting_changed: function() {
		// decoration settings changed
		this.refreshDecoration();

		// settings changed; instant refresh
		Mainloop.source_remove(this.timeout);
		this.refresh();
	},

	on_desklet_removed: function() {
		Mainloop.source_remove(this.timeout);
	},
}