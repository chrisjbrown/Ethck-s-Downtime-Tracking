// Imports
import AuditLog from "./audit-log.js";
import { DWTForm } from "./downtime.js";
import { GMConfig } from "./gmConfig.js";

let activateDowntimeTab = false;

// Register Game Settings
Hooks.once("init", () => {
    game.settings.registerMenu("downtime-ethck", "config", {
        name: "Config",
        label: "Access Config Menu",
        hint: "Access the configuration menu to find additional options.",
        icon: "fas fa-desktop",
        type: GMConfig,
        restricted: true,
    });

    game.settings.register("downtime-ethck", "enableTraining", {
        name: "Show Training Tab on PCs",
        hint: "Display the training tab for Player Characters",
        scope: "world",
        config: true,
        default: true,
        type: Boolean,
    });

    game.settings.register("downtime-ethck", "enableTrainingNpc", {
        name: "Show Training Tab on NPCs",
        hint: "Display the training tab for Non-Player Characters",
        scope: "world",
        config: true,
        default: true,
        type: Boolean,
    });

    game.settings.register("downtime-ethck", "aboutTimeCompat", {
        name: "Enable About Time Compatibility",
        hint: "Allows for About Time month/day to appear in Activity Log",
        scope: "world",
        config: true,
        default: false,
        type: Boolean,
    });

    game.settings.register("downtime-ethck", "crashCompat", {
        name: "Enable Compatibility for Crash's 5e Downtime Tracking",
        hint: "Allows for Crash's Downtime and this module to reside in the same tab.",
        scope: "world",
        config: true,
        default: true,
        type: Boolean,
    });

    game.settings.register("downtime-ethck", "crashCompatMessage", {
        name: "Add Extra Text To Distingusih between Downtime and Training?",
        hint: "Determines if extra text shows up between crash's tacking and training and this mod.",
        scope: "world",
        config: true,
        default: true,
        type: Boolean,
    });

    game.settings.register("downtime-ethck", "betterRollsCompat", {
        name: "Enable Compatibility for Better Rolls",
        hint: "Allows for Better Rolls alternate roll format to be used.",
        scope: "world",
        config: true,
        default: false,
        type: Boolean,
    });

    game.settings.register("downtime-ethck", "tabName", {
        name: "Tab Name",
        hint: "Name for the custom downtime tab",
        scope: "world",
        config: true,
        default: "Downtime",
        type: String,
    });

    game.settings.register("downtime-ethck", "dcRollMode", {
        name: "DC Roll Mode",
        hint: "Roll Mode used when downtime activities' DCs are called",
        scope: "world",
        config: true,
        type: String,
        choices: {
            gmroll: "Private GM Roll (Player can see)",
            blindroll: "Blind Roll (Player can't see)",
        },
        default: "blindroll",
    });

    game.settings.register("downtime-ethck", "extraSheetWidth", {
        name: "Extra Sheet Width",
        hint: "# of pixels to increase width of sheet by.",
        scope: "client",
        config: true,
        default: 50,
        type: Number,
    });

    game.settings.register("downtime-ethck", "activities", {
        scope: "world",
        config: false,
        default: [],
    });

    game.settings.register("downtime-ethck", "changes", {
        scope: "world",
        config: false,
        default: {},
    });

    game.settings.register("downtime-ethck", "migrated", {
        scope: "world",
        config: false,
        default: { status: false, version: "0.3.3" },
    });

    // Autocomplete Inline Properties AIP
    // Define the config for our package
    const aipConfig = {
        packageName: "downtime-ethck",
        sheetClasses: [
            {
                name: "DWTForm",
                fieldConfigs: [
                    {
                        selector: `.ethck-downtime-form #rollable #CUSTOM`,
                        showButton: true,
                        allowHotkey: true,
                        dataMode: CONST.AIP?.DATA_MODE.CUSTOM,
                        customDataGetter: (sheet) => {
                            return rollContext(sheet.actor);
                        },
                        customInlinePrefix: "@",
                    },
                ],
            },
        ],
    };

    // Add our config
    CONFIG.AIP?.PACKAGE_CONFIG.push(aipConfig);
});

Hooks.once("ready", () => {
    _downtimeMigrate();
});

// The Meat And Potatoes
async function addTrainingTab(app, html, data) {
    // Determine if we should show the downtime tab
    let showTrainingTab = false;
    if (data.isCharacter) {
        showTrainingTab = game.settings.get("downtime-ethck", "enableTraining");
    } else if (data.isNPC) {
        showTrainingTab = game.settings.get("downtime-ethck", "enableTrainingNpc");
    }

    if (showTrainingTab) {
        // Get our actor
        let actor = game.actors.contents.find((a) => a._id === data.actor._id);
        // actor isn't loaded in the world, or doesn't exist
        // i.e. compendiums
        if (actor === undefined) {
            return;
        }
        // Make sure flags exist if they don't already
        if (actor.flags["downtime-ethck"] === undefined || actor.flags["downtime-ethck"] === null) {
            await actor.setFlag("downtime-ethck", "trainingItems", []);
            await actor.setFlag("downtime-ethck", "changes", []);
        }

        let flags = actor.getFlag("downtime-ethck", "trainingItems");

        let CRASH_COMPAT = false;
        const crash5eTraining = game.modules.get("5e-training");

        if (
            crash5eTraining !== undefined &&
            crash5eTraining.active === true &&
            game.settings.get("downtime-ethck", "crashCompat")
        ) {
            // 0.4.6 changed how the tab is rendered, so our new logic requires this (10/23/2020)
            if (isNewerVersion(crash5eTraining.version, "0.4.6")) {
                // version must be GREATER to return true.
                CRASH_COMPAT = true;
            } else {
                ui.notifications.warn(
                    "Please update Crash's 5e Downtime Tracking to version 0.4.7 or greater to enable compaitbility."
                );
            }
        } else {
            // Update the nav menu
            let tabs = html.find('.tabs[data-group="primary"]');
            if (!tabs.find('.item[data-tab="downtime"]').length) {
                //Prevent addition of tab more than once
                let trainingTabBtn;
                if (game.system.id === "dnd5e") {
                    trainingTabBtn = $('<a class="item" data-tab="downtime"><i class="fas fa-beer-mug"></i></a>');
                } else {
                    let tabName = game.settings.get("downtime-ethck", "tabName");
                    trainingTabBtn = $('<a class="item" data-tab="downtime">' + tabName + "</a>");
                }
                tabs.append(trainingTabBtn);
            }
        }

        if (game.system.id === "dnd5e") {
            const skills = CONFIG.DND5E.skills;
        } else if (game.system.id === "pf1") {
            const skills = CONFIG.PF1.skills;
        }

        // Create the tab content
        let sheet;
        if (game.system.id === "dnd5e") {
            sheet = html.find(".tab-body");
        } else if (game.system.id === "pf1") {
            sheet = html.find(".primary-body");
            // template expects flags to be up a level, so copy them over.
            data.actor.flags["downtime-ethck"] = data.actor.flags["downtime-ethck"];
        }

        // Compile our template
        let ethckDowntimeTabHtml = $(
            await renderTemplate("modules/downtime-ethck/templates/training-section.html", {
                activities: game.settings.get("downtime-ethck", "activities"),
                actorAct: data,
                isGM: game.user.isGM,
            })
        );

        // attach to sheet
        let downtimeHTML = await compileDowntimeTab(CRASH_COMPAT, ethckDowntimeTabHtml, sheet);

        downtimeHandler(downtimeHTML, actor, app);

        // Set Training Tab as Active
        html.find('.tabs .item[data-tab="downtime"]').click((ev) => {
            app.activateDowntimeTab = true;
        });

        // Unset Training Tab as Active
        html.find('.tabs .item:not(.tabs .item[data-tab="downtime"])').click((ev) => {
            app.activateDowntimeTab = false;
        });
    }
}

Hooks.on(`renderActorSheet`, (app, html, data) => {
    // Borrowed from Crash's 5e-training to allow choice
    // of whether to be on same line or not.
    let widenSheet = adjustSheetWidth(app);
    if (widenSheet) {
        let newPos = { width: app.position.width + game.settings.get("downtime-ethck", "extraSheetWidth") };
        app.setPosition(newPos);
    }

    addTrainingTab(app, html, data).then(function () {
        if (app.activateDowntimeTab) {
            if (game.system.id === "dnd5e") {
                app._tabs[0].activate("downtime");
            } else if (game.system.id === "pf1") {
                app._tabsAlt.activate("downtime");
            }
        }
    });
});

async function outputRolls(actor, activity, event, trainingIdx, res, materials) {
    let cmsg = "";
    let cmsgResult = "";
    let triggeredComp = false;

    if (activity.type === "SUCCESS_COUNT") {
        let booleanResults = [0, 0];
        res.map((pair) => {
            if (pair[0] >= pair[1]) {
                //Rolled is greater than dc
                booleanResults[0] += 1;
            } else {
                //Rolled is less than dc
                booleanResults[1] += 1;
            }
        });

        cmsg = "With " + booleanResults[0] + " successes and " + booleanResults[1] + " failures.";
        activity.result?.forEach((result) => {
            if (result.min <= booleanResults[0] && result.max >= booleanResults[0]) {
                cmsgResult = result.details;
                if (result.triggerComplication) triggeredComp = true;
            }
        });
    } else if (activity.type === "ROLL_TOTAL") {
        let rollTotal = 0;
        if (res.length > 1) {
            // Take the first number of each roll and add them all together
            // Rolls are [roll, dc]
            rollTotal = res.reduce((sum, roll) => sum + roll[0], 0);
        } else {
            rollTotal = res[0][0];
        }

        activity.result.forEach((result) => {
            if (rollTotal >= parseInt(result.min) && rollTotal <= parseInt(result.max)) {
                cmsgResult = result.details;
                if (result.triggerComplication) triggeredComp = true;
            }
        });
    } else if (activity.type === "NO_ROLL") {
        // Do Nothing
    }

    // Add in materials, if any.
    cmsg = materials ? cmsg + "\n Used " + materials : cmsg;

    const cmsgTemplate = await renderTemplate("modules/downtime-ethck/templates/chatMessage.html", {
        img: activity.chat_icon,
        text: cmsg,
        result: cmsgResult,
    });

    // Determine if we whisper this message, and who to
    const cmsgVis = activity.options.rolls_are_private || game.settings.get("core", "rollMode") === "gmroll";
    const gmUserIds = game.users.filter((user) => user.role === 4).map((gmUser) => gmUser.id);

    // Results message
    ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor }),
        content: cmsgTemplate,
        flavor: "has completed the downtime activity of " + activity.name,
        type: CONST.CHAT_MESSAGE_TYPES.IC,
        // Current user + all gm users
        whisper: cmsgVis ? [game.user.id, ...gmUserIds] : [],
    });

    // Test if complications are being used
    if (activity.complication !== undefined) {
        const num = Math.floor(Math.random() * 100) + 1; // 1-100
        if (triggeredComp || num <= parseInt(activity.complication.chance)) {
            // Complication has occured
            let tableRes = game.tables.get(activity.complication.roll_table);
            // Also outputs chat message, YAY!
            let opts = {};
            if (activity.options.complications_are_private === true) {
                opts["rollMode"] = "blindroll";
            }
            tableRes.draw(opts);
        }
    }

    let timestamp = Date.now();

    // About Time Compat TIME
    if (game.settings.get("downtime-ethck", "aboutTimeCompat")) {
        const aboutTime = game.modules.get("about-time");
        if (aboutTime !== undefined && aboutTime.active === true) {
            timestamp = game.Gametime.DTNow().longDate().date;
        }
    } else {
        timestamp = new Date(timestamp).toDateString();
    }

    // Activity log format
    const change = {
        timestamp: timestamp,
        user: game.user.name,
        activityName: activity.name,
        result: cmsgResult,
        timeTaken: activity.options.days_used,
        materials: materials,
    };

    // Handle flags
    let flags = actor.getFlag("downtime-ethck", "changes");
    if (!flags) flags = [];
    flags.push(change);
    await actor.unsetFlag("downtime-ethck", "changes");
    await actor.setFlag("downtime-ethck", "changes", flags);
}

/*
  Just make a quick simple roll (typically hidden) to find the DC, if needed. 

  return: Roll()
*/
async function rollDC(rollable) {
    if (!rollable.dc) return { _total: 0 }; // If no DC, return fake total (it doesn't matter...)
    const rdc = new Roll(rollable.dc);
    await rdc.toMessage(
        {},
        {
            rollMode: game.settings.get("downtime-ethck", "dcRollMode"),
            create: true,
        }
    );

    return rdc;
}

/*
  For each given roll, determine the type (check, save, formula, tool, skill)
  then construct our roll, roll it, then roll the DC. res is [rollTotal, dcTotal]
  and used to calculate the overall results. This is wrapped in a promise mainly for
  enabling awaits of Dice So Nice animations (see diceSoNiceRollComplete hook).

  return: [rollTotal, dcTotal]
*/
async function rollRollable(actor, activity, rollable) {
    return new Promise(async (resolve, reject) => {
        let res = [];
        let r = null;
        let br = game.settings.get("downtime-ethck", "betterRollsCompat") && game.modules.get("betterrolls5e").active;
        if (rollable.type === "ABILITY_CHECK") {
            // roll an ability check, then dc
            // rollAbilityTest assumes that the argument
            // is in short form, i.e. "str", "con"
            if (br) {
                r = await BetterRolls.rollCheck(actor, rollable.roll, {});
            } else {
                r = await actor.rollAbilityTest(rollable.roll);
            }
        } else if (rollable.type === "SAVING_THROW") {
            // roll a save
            // rollAbilitySave has the same assumption
            if (br) {
                r = await BetterRolls.rollSave(actor, rollable.roll, {});
            } else {
                if (game.system.id === "dnd5e") {
                    r = await actor.rollAbilitySave(rollable.roll);
                } else if (game.system.id === "pf1") {
                    r = await actor.rollSavingThrow(rollable.roll);
                }
            }
        } else if (rollable.type === "TOOL_CHECK") {
            let actorTool;
            // instead of giving the user the 20+ instruments to select
            // from, we instead have one option for each group
            // When selected, this option will then find every tool of that type
            // in the actor's inventory and provide the ability to choose
            // between them.
            const actorTools = actor.items.filter(
                (item) => item.type === "tool" && item.name.toLowerCase().includes(rollable.roll.toLowerCase())
            );

            let toolChoices = {
                rollableGroups: actorTools.map((tool) => {
                    return {
                        roll: tool.name,
                        dc: rollable.dc,
                        group: rollable.roll,
                    };
                }),
            };

            const choice = await chooseRollDialog(toolChoices, rollable.roll);
            actorTool = actorTools[choice[0]];

            if (actorTool !== null) {
                if (br) {
                    r = await BetterRolls.rollItem(actorTool).toMessage();
                } else {
                    r = await actorTool.rollToolCheck();
                }
            } else {
                // No tool of that name found.
                ui.notifications.error(
                    "Tool with name " + rollable[0] + " not found. Please ensure the name is correct."
                );
                res = [];
            }
        } else if (rollable.type === "CUSTOM") {
            // call our helper after separating all terms
            r = await formulaRoll(rollable.roll.split(" + "), actor);
        } else {
            // skills...
            // The Skill Custimization 5e module patches actor.rollSkill and makes it NOT be a promise
            // so we have to handle it differently.
            let skillCust = game.modules.get("skill-customization-5e");
            if (skillCust && skillCust.active) {
                r = await _skillCustHandler(rollable.roll, actor);
            } else {
                if (br) {
                    r = await BetterRolls.rollSkill(actor, rollable.roll, {});
                } else {
                    r = await actor.rollSkill(rollable.roll);
                }
            }
        }

        // pf1 return object has an extra layer on top that we don't need
        // so we strip it here, but our custom roll does not
        if (game.system.id === "pf1" && rollable.type !== "CUSTOM") {
            r = r._roll;
        }

        if (br) {
            if (r._total === undefined) {
                // For some reason Tool Checks still have this BetterRollsCardBinding
                // so we alias some expected properties.
                if (r.entries === undefined) {
                    r.entries = r.BetterRollsCardBinding.roll.entries;
                    r.params = r.BetterRollsCardBinding.roll.params;
                }
                const brEntries = r.entries
                    .find((part) => part.type === "multiroll")
                    .entries.map((entry) => entry.total);
                let result = r.params.rollState === "lowest" ? Math.min(...brEntries) : Math.max(...brEntries);
                r._total = result;
            }
        }

        const dc = await rollDC(rollable);
        res = [r._total, dc._total];

        // For some reason, we don't have a roll or a dc roll...
        if (res.length === 0) {
            throw "Ethck's Downtime Tracking | Error on rolling.";
            reject();
        }
        resolve(res);
    });
}

async function compileDowntimeTab(CRASH_COMPAT, ethckDowntimeTabHtml, sheet) {
    return new Promise((resolve, reject) => {
        // Add our HTML nicely...
        if (CRASH_COMPAT === true && game.settings.get("downtime-ethck", "crashCompat")) {
            Hooks.on(`CrashTrainingTabReady`, async (app2, html2, data2) => {
                ethckDowntimeTabHtml = ethckDowntimeTabHtml.find(".inventory-list").unwrap();
                let crash5eTrainingHtml = html2.find(".crash-training");
                crash5eTrainingHtml.find(".ethck-downtime, .items-list section").remove(); // Remove Old
                crash5eTrainingHtml.find(".items-list").append(ethckDowntimeTabHtml); // Add New
                crash5eTrainingHtml.find(".ethck-downtime").wrap("<section style='margin-top: 5%;'></section>");
                const crashExtraDesc = game.settings.get("downtime-ethck", "crashCompatMessage");
                if (crashExtraDesc) {
                    crash5eTrainingHtml
                        .find(".ethck-downtime")
                        .parent()
                        .prepend(
                            "<label>Above this is Crash's Tracking and Training. Below is Ethck's Downtime</label>"
                        );
                }
                resolve(crash5eTrainingHtml);
            });
        } else {
            sheet.append(ethckDowntimeTabHtml);
            resolve(sheet);
        }
    });
}

async function materialsPrompt(activity) {
    return new Promise((resolve, reject) => {
        if (!("ask_for_materials" in activity.options) || !activity.options.ask_for_materials) {
            resolve("");
        } else {
            new Dialog({
                title: `Enter Material Costs`,
                content: `<input type="text" placeholder="20gp" id="materials"/>`,
                buttons: {
                    submit: {
                        icon: "<i class='fas fa-check'></i>",
                        label: "Submit",
                    },
                },
                default: "submit",
                close: async (html) => {
                    resolve(html.find("#materials").val());
                },
            }).render(true);
        }
    });
}

// Roll our custom formula
async function formulaRoll(formula, actor) {
    return new Promise(async (resolve, reject) => {
        // dRoll is the type (adv., norm, disadv.)
        // dForm is the HTML of the dialog.
        let [dRoll, dForm] = await _formulaDialog(formula);
        // get our bonus
        let bonus = $(dForm).find('input[name="bonus"]').val();
        if (bonus) {
            // destructure our array
            formula.push(...bonus.split(" + "));
        }
        // only supports 1dX rolls by making them 2dX
        if (game.system.id === "dnd5e") {
            if (parseInt(formula[0].split("d")[0]) === 1) {
                let mods = "";
                if (dRoll !== 0) {
                    if (dRoll === 1) {
                        mods += "kh"; // Advantage
                    } else {
                        mods += "kl"; // Disadvantage
                    }

                    let firstTerms = formula[0].split("d");
                    let newFirst = "2d" + firstTerms[1];
                    formula[0] = newFirst + mods;
                }
            }
        } else if (game.system.id === "pf1") {
            // Pathfinder has "Normal", "Take 10", and "Take 20"
            // The "Take X" sets the result to "X"
            // Order is
            // 1 = Normal
            // 0 = Take 10
            // -1 = Take 20
            if (dRoll === 0) {
                formula = [10];
            } else if (dRoll === -1) {
                formula = [20];
            }
        }

        let context = rollContext(actor);
        let myRoll = new Roll(formula.join(" + "), context);
        await myRoll.toMessage();
        // we're done!
        resolve(myRoll);
    });
}

function rollContext(actor) {
    // Organize additional properties for use in the context
    // This finds the value of hit dice for any class in the actor
    let hdVals = [];
    if (game.system.id === "dnd5e") {
        hdVals = actor.items
            .filter((item) => item.type === "class")
            .map((hd) => parseInt(hd.data.hitDice.split("d")[1]));
    } else if (game.system.id === "pf1") {
        hdVals = actor.items.filter((item) => item.type === "class").map((hd) => parseInt(hd.data.hd));
    }
    // Find the min and the max
    // These must be roll values, so add 1d to start.
    let hd = {
        min: "1d" + Math.min.apply(null, hdVals),
        max: "1d" + Math.max.apply(null, hdVals),
    };

    // return custom context + og context in the same object
    return mergeObject({ actor: actor, hd: hd }, actor.getRollData());
}

// slightly reworked _d20RollDialog from the d&d5e system
// formula is an array of parts
async function _formulaDialog(formula) {
    let pf = game.system.id === "pf1";
    return new Promise(async (resolve, reject) => {
        let rollTemplate = await renderTemplate("modules/downtime-ethck/templates/custom-rolls.hbs", {
            formula: formula.join(" + "),
            rollModes: CONFIG.Dice.rollModes,
            system: game.system.id,
        });
        new Dialog({
            title: "Custom Formula Roll",
            content: rollTemplate,
            buttons: {
                advantage: {
                    label: pf ? "Normal" : "Advantage",
                    callback: (event) => resolve([1, event]),
                },
                normal: {
                    label: pf ? "Take 10" : "Normal",
                    callback: (event) => resolve([0, event]),
                },
                disadvantage: {
                    label: pf ? "Take 20" : "Disadvantage",
                    callback: (event) => resolve([-1, event]),
                },
            },
            default: "normal",
            close: () => resolve(null),
        }).render(true);
    });
}

async function chooseRollDialog(groups, type = "") {
    const dialogContent = await renderTemplate("modules/downtime-ethck/templates/chooseRoll.html", {
        groups: groups,
        type: type,
    });
    return new Promise(async (resolve, reject) => {
        const dlg = new Dialog({
            title: "Choose Roll",
            content: dialogContent,
            buttons: {
                submit: {
                    icon: '<i class="fas fa-dice"></i>',
                    label: "Submit",
                    callback: (html) => {
                        let chosen = [];
                        let fields = html.find("form > fieldset > div > input:checked");

                        if (fields.length === Object.keys(groups).length) {
                            fields.each((i, check) => {
                                const c = parseInt($(check).val());
                                chosen.push(c);
                            });

                            resolve(chosen);
                        } else {
                            // This seems ugly, but it works.
                            throw new Error("Ethck's Downtime | Choice prompt not filled.");
                        }
                    },
                },
            },
            close: reject,
        });
        dlg.render(true);
    });
}

async function _skillCustHandler(skillAcr, actor) {
    let br = game.settings.get("downtime-ethck", "betterRollsCompat") && game.modules.get("betterrolls5e").active;
    return new Promise(async (resolve, reject) => {
        actor.rollSkill(skillAcr, {}); // call the patched function
        // only way to know it's done is by the final chat message, so listen for it
        Hooks.on("createChatMessage", async (message, options, id) => {
            // discard if not a roll
            if (message.isRoll) {
                // make sure it's our expected Skill Check
                let skiname = CONFIG.DND5E.skills[skillAcr];
                if (
                    (getProperty(message, "data.flavor") &&
                        getProperty(message, "data.flavor").includes(skiname + " Skill Check")) ||
                    (br && $(message.content).find("header h3").text() == skiname)
                ) {
                    // return the roll
                    if (br) {
                        resolve({ _total: parseInt($(message.content).find(".dice-total span").text()) });
                    } else {
                        resolve(message._roll);
                    }
                }
            }
        });
    });
}

// Determines whether or not the sheet should have its width adjusted.
// If the setting for extra width is set, and if the sheet is of a type for which
// we have training enabled, this returns true.
function adjustSheetWidth(app) {
    let settingEnabled = !!game.settings.get("downtime-ethck", "extraSheetWidth");
    let sheetHasTab =
        (app.object.type === "npc" && game.settings.get("downtime-ethck", "enableTrainingNpc")) ||
        (app.object.type === "character" && game.settings.get("downtime-ethck", "enableTraining"));

    let currentWidth = app.position.width;
    let defaultWidth = app.options.width;
    let sheetIsSmaller = currentWidth < defaultWidth + game.settings.get("downtime-ethck", "extraSheetWidth");

    return settingEnabled && sheetHasTab && sheetIsSmaller;
}

async function _downtimeMigrate() {
    if (!game.user.isGM) return;
    //await game.settings.set("downtime-ethck", "migrated", false);
    const NEEDS_MIGRATION_VERSION = "0.4.3";
    // Updating from old install -> Migrated
    // Fresh install -> No migration CHECK
    // Skipped multiple versions and upgrading in 0.4.X or higher
    // X round of migrations (bound to happen again, right?)
    let migrated = game.settings.get("downtime-ethck", "migrated");
    // If we have migrated before
    if (migrated.status) {
        // If our version is newer than the NEEDS_MIGRATION_VERSION
        if (isNewerVersion(game.modules.get("downtime-ethck").version, NEEDS_MIGRATION_VERSION)) return;
        // If we are on the same version, but have migrated.
        if (migrated.version === NEEDS_MIGRATION_VERSION) return;
    }

    // Save a backup of the old data
    ui.notifications.info("Ethck's Downtime | Backing up World Downtimes");
    const oldActivities = game.settings.find((setting) => setting.key === "downtime-ethck.activities");
    const jsonData = JSON.stringify(oldActivities, null, 2);
    saveDataToFile(jsonData, "application/json", "downtime-ethck-world-activities-OLD.json");
    ui.notifications.info("Ethck's Downtime | Saved Activity Data.");

    ui.notifications.notify("Ethck's 5e Downtime Tracking | Beginning Migration to updated schema.");

    // Update Actor Flags
    game.actors.forEach(async (actor) => {
        // If it doesn't have our flags, idc
        let downtimes = actor.getFlag("downtime-ethck", "trainingItems");
        if (!downtimes) return;

        try {
            let changed = false;
            [downtimes, changed] = await _updateDowntimes(downtimes);
            if (changed) {
                let update = {
                    id: actor.id,
                    "flags.downtime-ethck": { trainingItems: downtimes },
                };

                await actor.update(update, { enforceTypes: false });
            }
        } catch (e) {
            console.error(e);
            ui.notifications.warning(
                "Ethck's Downtime | Something went wrong while migrating. Please open bug report with your backed-up copy of your downtimes."
            );
        }
    });

    let worldDowntimes = game.settings.get("downtime-ethck", "activities");
    if (worldDowntimes) {
        let changed = false;
        [worldDowntimes, changed] = await _updateDowntimes(worldDowntimes);
        await game.settings.set("downtime-ethck", "activities", worldDowntimes);
    }

    ui.notifications.notify("Ethck's 5e Downtime Tracking | Migration Complete.");
    await game.settings.set("downtime-ethck", "migrated", { status: true, version: NEEDS_MIGRATION_VERSION });
}

export async function _updateDowntimes(downtimes) {
    let changed = false;
    downtimes.forEach((downtime, i) => {
        // Handle old private
        // 12/3/2020 v0.3.3
        if ("private" in downtime) {
            // If previously updated, the "new" value might be here
            if (!("actPrivate" in downtime)) {
                downtime.actPrivate = downtime.private;
            }

            delete downtime.private;
            changed = true;
        }

        // Update tables, might not be present?
        // 12/3/2020 v0.3.3
        if ("complication" in downtime) {
            if ("table" in downtime.complication) {
                // Old format where table was the string id of the table
                if (typeof downtime.complication.table === "string" || downtime.complication.table instanceof String) {
                    let tid = "";
                    if (downtime.complication.table !== "") {
                        let table = game.tables.getName(downtime.complication.table);
                        if (!table) table = game.tables.get(downtime.complication.table);
                        tid = table.id;
                    }
                    downtime.complication.table = { id: tid };
                    changed = true;
                }
            }
        }
        // 12/23/2020 v0.4.0 transfer to new roll model
        if ("rollableGroups" in downtime) {
            let newRolls = downtime.rollableGroups.flatMap((group) => {
                if (group.rolls.length === 0) return;
                let g = group.group || "";
                let rolls = group.rolls.map((roll) => {
                    // new format is an object
                    if (!Array.isArray(roll)) return;
                    let typeRoll = determineOldType(roll); // Determine type
                    let dc = roll[1] || null; // Use old DC, or default to null
                    let rollVal = roll[0];
                    // ensure our DC is a number
                    if (typeof dc === "number") {
                        dc = dc.toString();
                    }

                    if (typeRoll === "CUSTOM") {
                        rollVal = rollVal.split("Formula: ")[1];
                    } else if (typeRoll === "SKILL_CHECK") {
                        let skills = CONFIG.DND5E.skills;
                        // returns shorthand of skill
                        rollVal = Object.keys(skills).find((key) => skills[key] === rollVal);
                    } else if (typeRoll === "TOOL_CHECK") {
                    } else {
                        //abiCheck, save
                        if (typeRoll === "ABILITY_CHECK") {
                            rollVal = rollVal.split(" Check")[0];
                        } else {
                            rollVal = rollVal.split(" Saving Throw")[0];
                        }
                        let abilities = CONFIG.DND5E.abilities;
                        // Returns shorthand of ability
                        rollVal = Object.keys(abilities)
                            .find((key) => abilities[key] === rollVal)
                            .toLowerCase();
                    }
                    changed = true;
                    return { type: typeRoll, roll: rollVal, group: g, dc: dc };
                });

                return rolls;
            });
            newRolls = newRolls.filter(Boolean);
            downtime.roll = newRolls;
        }
        // 12/23/2020 v0.4.0 transfer to new result model
        if ("results" in downtime) {
            // downtime.results[0] old format is an array
            // new format is object
            if (Array.isArray(downtime.results[0])) {
                let res = duplicate(downtime.results);

                let newRes = res.map((result) => {
                    return {
                        min: result[0], // lower bound
                        max: result[1], // high bound
                        details: result[2], // description
                        triggerComplication: false, // trigger complication if result occurs
                    };
                });

                downtime.result = newRes;
                changed = true;
            }
        }
        // 12/23/20 v0.4.0 transfer to new activity model
        if ("rollableGroups" in downtime && "rollableEvents" in downtime) {
            if (downtime?.type === "succFail") {
                downtime.type = "SUCCESS_COUNT";
            } else if (downtime?.type === "categories") {
                downtime.type = "ROLL_TOTAL";
            } else {
                downtime.type = "NO_ROLL";
            }
            // Load new model.
            downtimes[i] = {
                name: downtime.name || "New Downtime Activity",
                description: downtime.description || "My awesome downtime activity",
                chat_icon: downtime.img || "icons/svg/d20.svg",
                sheet_icon: downtime.rollIcon || "icons/svg/d20.svg",
                type: downtime.type, //* ACTIVITY_TYPES
                roll: downtime.roll, //* ACTIVITY_ROLL_MODEL
                result: downtime.result, //* ACTIVITY_RESULT_MODEL
                id: downtime.id.toString() || randomID(),
                complication: {
                    chance: downtime.complication.chance || 0,
                    roll_table: downtime.complication.table.id || "",
                },
                options: {
                    rolls_are_private: downtime.actPrivate || false,
                    complications_are_private: downtime.compPrivate || false,
                    ask_for_materials: downtime.useMaterials || false,
                    days_used: downtime.timeTaken || "",
                    hidden: false,
                },
            };

            changed = true;
        }
        // 3/20/2021 v0.4.3 added activity visibility
        if (!("hidden" in downtime.options)) {
            downtime.options.hidden = false;
            changed = true;
        }
    });

    return [downtimes, changed];
}

function determineOldType(roll) {
    const abilities = ["str", "dex", "con", "int", "wis", "cha"];
    const skills = CONFIG.DND5E.skills;
    const toolFilters = ["Tool", "Supplies", "Kit", "Instrument", "Utensils", "Set"];

    // STRENGTH, DEXTERITY, CONSTITUTION, INTELLIGENCE, WISDOM, CHARISMA CHECK
    if (roll[0].includes("Check")) {
        return "ABILITY_CHECK";
        // STRENGTH, DEXTERITY, CONSTITUTION, INTELLIGENCE, WISDOM, CHARISMA SAVING THROW
    } else if (roll[0].includes("Saving Throw")) {
        return "SAVING_THROW";
        // includes ["Tool", "Supplies", "Kit", "Instrument", "Utensils", "Set"] in name
    } else if (toolFilters.some((filter) => roll[0].includes(filter))) {
        return "TOOL_CHECK";
        // Special formulas
    } else if (roll[0].includes("Formula:")) {
        return "CUSTOM";
        // We must be at skills...
    } else {
        return "SKILL_CHECK";
    }
}

// 12/27/23 Add compat with kgar tidy5e sheet rewrite
Hooks.once("tidy5e-sheet.ready", (api) => {
    api.registerCharacterTab(
        new api.models.HandlebarsTab({
            title: game.settings.get("downtime-ethck", "tabName"),
            path: "modules/downtime-ethck/templates/training-section.html",
            tabId: "downtime-ethck",
            getData: async (data) => {
                let showTrainingTab = false;
                if (data.isCharacter) {
                    showTrainingTab = game.settings.get("downtime-ethck", "enableTraining");
                } else if (data.isNPC) {
                    showTrainingTab = game.settings.get("downtime-ethck", "enableTrainingNpc");
                }

                if (showTrainingTab) {
                    // Get our actor
                    let actor = data.actor;
                    // Make sure flags exist if they don't already
                    if (actor.flags["downtime-ethck"] === undefined || actor.flags["downtime-ethck"] === null) {
                        await actor.setFlag("downtime-ethck", "trainingItems", []);
                        await actor.setFlag("downtime-ethck", "changes", []);
                    }

                    data.activities = game.settings.get("downtime-ethck", "activities");
                    data.actorAct = data;
                    data.isGM = game.user.isGM;
                    return new Promise((resolve) => {
                        resolve(data);
                    });
                }
            },
            onRender(params) {
                const myTab = $(params.tabContentsElement);
                downtimeHandler(myTab, params.data.actor, params.app);
            },
        })
    );
});

function downtimeHandler(downtimeHTML, actor, app) {
    let flags = actor.getFlag("downtime-ethck", "trainingItems");
    // Add New Downtime Activity
    downtimeHTML.find(".activity-add").click(async (event) => {
        event.preventDefault();
        let form = new DWTForm(actor);
        form.render(true);
    });

    // Add New Downtime Activity
    downtimeHTML.find(".world-add").click(async (event) => {
        event.preventDefault();
        let form = new DWTForm(actor, {}, false, true, app);
        form.render(true);
    });

    // Edit Downtime Activity
    downtimeHTML.find(".activity-edit").click(async (event) => {
        event.preventDefault();

        // Set up some variables
        let fieldId = event.currentTarget.id;
        let trainingIdx = parseInt(fieldId.replace("ethck-edit-", ""));
        let activity;
        let world = false;
        if ($(event.currentTarget).parent().hasClass("worldRoll")) {
            activity = game.settings.get("downtime-ethck", "activities")[trainingIdx];
            world = true;
        } else {
            activity = flags[trainingIdx];
        }
        let form = new DWTForm(actor, activity, true, world, app);
        form.render(true);
    });

    // Remove Downtime Activity
    downtimeHTML.find(".activity-delete").click(async (event) => {
        event.preventDefault();

        // Set up some variables
        let fieldId = event.currentTarget.id;
        let trainingIdx = parseInt(fieldId.replace("ethck-delete-", ""));
        let world = false;
        let activity;
        if ($(event.currentTarget).parent().hasClass("worldRoll")) {
            activity = game.settings.get("downtime-ethck", "activities")[trainingIdx];
            world = true;
        } else {
            activity = flags[trainingIdx];
        }
        let del = false;
        let dialogContent = await renderTemplate("modules/downtime-ethck/templates/delete-training-dialog.html");

        // Create dialog
        new Dialog({
            title: `Delete Downtime Activity`,
            content: dialogContent,
            buttons: {
                yes: {
                    icon: "<i class='fas fa-check'></i>",
                    label: "Delete",
                    callback: () => (del = true),
                },
                no: {
                    icon: "<i class='fas fa-times'></i>",
                    label: "Cancel",
                    callback: () => (del = false),
                },
            },
            default: "yes",
            close: async (html) => {
                if (del) {
                    // Delete item and update actor
                    if (world) {
                        let newAct = game.settings.get("downtime-ethck", "activities");
                        newAct.splice(trainingIdx, 1);
                        await game.settings.set("downtime-ethck", "activities", newAct);
                        app.render(true);
                    } else {
                        flags.splice(trainingIdx, 1);
                        await actor.unsetFlag("downtime-ethck", "trainingItems");
                        await actor.setFlag("downtime-ethck", "trainingItems", flags);
                    }
                }
            },
        }).render(true);
    });

    // Move Downtime Activity
    downtimeHTML.find(".activity-move").click(async (event) => {
        event.preventDefault();

        // Set up some variables
        let fieldId = event.currentTarget.id;
        let trainingIdx = parseInt(fieldId.replace("ethck-move-", ""));

        let tflags;
        let world = false;
        if ($(event.currentTarget).parent().hasClass("worldRoll")) {
            tflags = game.settings.get("downtime-ethck", "activities");
            world = true;
        } else {
            tflags = duplicate(flags);
        }

        let activity = tflags[trainingIdx];

        let move = 0;
        if ($(event.target).hasClass("fa-chevron-up")) {
            move = -1;
        } else {
            move = 1;
        }
        // loop to bottom
        if (trainingIdx === 0 && move === -1) {
            tflags.push(tflags.shift());
            // loop to top
        } else if (trainingIdx === tflags.length - 1 && move === 1) {
            tflags.unshift(tflags.pop());
            // anywhere in between
        } else {
            tflags[trainingIdx] = tflags[trainingIdx + move];
            tflags[trainingIdx + move] = activity;
        }

        if (world) {
            await game.settings.set("downtime-ethck", "activities", tflags);
            app.render(true);
        } else {
            await actor.setFlag("downtime-ethck", "trainingItems", tflags);
        }
    });

    // Roll Downtime Activity
    downtimeHTML.find(".activity-roll").click(async (event) => {
        event.preventDefault();

        let fieldId = event.currentTarget.id;
        let trainingIdx = parseInt(fieldId.replace("ethck-roll-", ""));
        let activity = {};

        // Get our activity given the selected roll
        if ($(event.currentTarget).hasClass("localRoll")) {
            activity = flags[trainingIdx];
        } else if ($(event.currentTarget).hasClass("worldRoll")) {
            activity = game.settings.get("downtime-ethck", "activities")[trainingIdx];
        }

        const materials = await materialsPrompt(activity);

        let res = [];

        let rolls = [];
        if (activity.type !== "NO_ROLL") {
            // build dict of group: rolls pairs
            // key is the group name
            // val is the roll(s) in that group
            const groups = {};
            for (let roll of activity.roll) {
                let group = groups[roll.group];
                // make a new group
                if (group == null) {
                    group = [];
                    groups[roll.group] = group;
                }
                // add to group
                group.push(roll);
            }

            if (Object.values(groups).every((rg) => rg.length === 1)) {
                // No choices, just execute
                // Just store all values.
                rolls = Object.values(groups).flat();
            } else {
                // Some choices need to be made
                // choices is array of selected index for each group
                // i.e. [1, 0, 3, 0]

                // We internally use shorthand for everything
                // so convert it to longhand when we print
                let readableGroups = {};
                let igroups = duplicate(groups);
                for (const [key, val] of Object.entries(igroups)) {
                    readableGroups[key] = val.map((roll) => {
                        if (roll.type === "ABILITY_CHECK" || roll.type === "SAVING_THROW") {
                            if (game.system.id === "dnd5e") {
                                roll.roll = CONFIG.DND5E.abilities[roll.roll];
                            } else if (game.system.id === "pf1") {
                                roll.roll = CONFIG.PF1.abilities[roll.roll];
                            }
                        } else if (roll.type === "SKILL_CHECK") {
                            if (game.system.id === "dnd5e") {
                                roll.roll = CONFIG.DND5E.skills[roll.roll];
                            } else if (game.system.id === "pf1") {
                                roll.roll = CONFIG.PF1.skills[roll.roll];
                            }
                        } else {
                            roll.roll = roll.roll;
                        }

                        return roll;
                    });
                }

                const choices = await chooseRollDialog(readableGroups);
                const groupVals = Object.values(groups);
                // match choices to their indexed rolls.
                rolls = groupVals.map((group, i) => {
                    return group[choices[i]];
                });
            }
        }

        try {
            // wait for rollRollable to roll these
            let rollRes = rolls.map(async (roll) => {
                return await rollRollable(actor, activity, roll);
            });
            res.push(...(await Promise.all(rollRes)));
            // output results
            outputRolls(actor, activity, event, trainingIdx, res, materials);
        } catch (e) {
            console.log(e);
        }
    });

    // Toggle Information Display
    // Modified version of _onItemSummary from dnd5e system located in
    // dnd5e/module/actor/sheets/base.js
    downtimeHTML.find(".activity-toggle-desc").click(async (event) => {
        event.preventDefault();
        // Set up some variables
        //let flags = actor.flags["downtime-ethck"];
        let fieldId = event.currentTarget.id;
        let trainingIdx = parseInt(fieldId.replace("ethck-toggle-desc-", ""));
        let activity = {};

        if ($(event.currentTarget).hasClass("localRoll")) {
            activity = flags[trainingIdx];
        } else if ($(event.currentTarget).hasClass("worldRoll")) {
            activity = game.settings.get("downtime-ethck", "activities")[trainingIdx];
        }

        let desc = "";

        let li = $(event.currentTarget).parents(".item");

        if (li.hasClass("expanded")) {
            let summary = li.children(".item-summary");
            summary.slideUp(200, () => summary.remove());
        } else {
            let div = $(
                `<div class="item-summary"><label>Description: ` +
                    activity.description +
                    `</label></br><label>` +
                    desc +
                    `</label></div>`
            );
            li.append(div.hide());
            div.slideDown(200);
        }
        li.toggleClass("expanded");
    });

    // Review Changes
    downtimeHTML.find(".activity-log").click(async (event) => {
        event.preventDefault();
        new AuditLog(actor).render(true);
    });

    // Edit world level downtime activities
    downtimeHTML.find(".edit-world").click(async (event) => {
        event.preventDefault();
        new GMConfig().render(true);
    });
}
