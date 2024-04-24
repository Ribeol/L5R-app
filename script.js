"use strict";

// #region Class definitions ----------------------------------------------------------------------------------------------------

class UserSettings {
    constructor(languages) {
        
        this.latestCharacterName = undefined;

        // this.cacheUpdate is set through initialize and stores the date of the last cache update
        this.lastCacheTime = undefined;

        // If the browser language is part of languages, it becomes the default language
        const language = (navigator.language || navigator.userLanguage).slice(0,2);
        if (languages.includes(language)) {
            this.language = language;
        }
        // Otherwise, choose the first available language, which should be the language that has the most content in its JSON files
        else {
            this.language = languages[0];
        }        

        this.values = {
            currentTabClass: "profile",
            skillGroupFilter: undefined,
            skillRankFilter: undefined,
            skillAvailabilityFilter: undefined,
            skillCurriculaFilter: undefined,
            techRankFilter: undefined,
            techGroupFilter: undefined,
            techActivationFilter: undefined,
            techRingFilter: undefined,
            techAvailabilityFilter: undefined,
            techCurriculaFilterFilter: undefined,
            traitGroupFilter: undefined,
            traitRingFilter:undefined,
            traitTypeFilter:undefined,
            traitAvailabilityFilter:undefined
        }        
    }
}

class DataManager {
    static cacheName = "L5R_app";

     // For each language + base, the JSON file with a matching name will be cached for each of the following content types.
    static contentGroups = ["clans", "equipment", "families", "qualities", "schools", "traits", "rings", "skills", "techniques", "titles", "ui"];

    constructor() {
        
        // Singleton pattern
        if (DataManager.instance) {
            return DataManager.instance;
        }
        DataManager.instance = this;

        // this.contentInfo is set through initialize
        this.contentInfo = {
            languages: undefined,
            lastContentUpdate: undefined            
        }

        // this.userSettings gets its object properties through initialize, and will be used to restore the content to its last state
        this.userSettings = undefined;
        // this.content gets all the game content from cached JSON files through initialize, based on the language from usersettings
        this.content = {};

        // this.availableCharacterOptions will store select options for all loadable characters in an array
        this.availableCharacterOptions = undefined;
        
        // this.current is a container for the current character, as well as data derived from it and from this.content
        this.current = {            
            character: undefined,

            // Schools or titles are called institutions
            institutionSkills: undefined, // Map with institutionRef as keys, and arrays as values, each array containing a Set of skills per rank
            institutionTechs: undefined, // Map with institutionRef as keys, and arrays as values, each array containing a Set of techs per rank
            institutionProgress: undefined, // Map with institutionRef as keys, and objects as values (with progressXp and rank properties)
            spentXp: undefined, // int

            ringPairMaps: { // Maps with rings as keys, and ring ranks as values
                all: undefined, 
                upgradable: undefined
            },

            skillPairMaps: { // Maps with skills as keys, and skill ranks as int values
                all: undefined,
                learned: undefined, 
                upgradable: undefined,
                included: undefined,
                rank: undefined
            },

            techSets: { // Sets of techniques
                learned: undefined,
                compatible: undefined,
                available: undefined,
                missable: undefined,
                included: undefined,
                rank: undefined
            }
        };        
    }

    async initialize() {              
        if ("caches" in window) {

            const cache = await caches.open(DataManager.cacheName);
            await cache.add(`./content/contentInfo.json`);

            // Get the set of available languages
            dataManager.contentInfo = await dataManager.getContentInfo(cache);
            // Get dataManager.userSettings
            dataManager.userSettings = await dataManager.getUserSettings(cache, dataManager.contentInfo.languages);
            // Set language options for the language element (this part is unaffected by the chosen language, so we can set this here instead of displayManager)
            for (const language of dataManager.contentInfo.languages) {
                const option = document.createElement("option");
                option.value = language;
                option.text = language;
                const languageSelect = document.getElementById("language");
                languageSelect.options.add(option);
                languageSelect.value = dataManager.userSettings.language;
            }

            // Get dataManager.availableCharacterOptions
            dataManager.availableCharacterOptions = await dataManager.getAvailableCharacterOptions(cache);

            // If content has not been cached since the last content update, or if either date is missing, change the cache date to now and cache the content
            if (dataManager.contentInfo.lastContentUpdate === undefined || dataManager.userSettings.lastCacheTime === undefined || new Date(dataManager.contentInfo.lastContentUpdate).getTime() > dataManager.userSettings.lastCacheTime) {

                dataManager.userSettings.lastCacheTime = Date.now();

                // Create an array of all content directory paths
                const paths = [`./content/base`];
                for (const language of dataManager.contentInfo.languages) {
                    paths.push(`./content/${language}`);
                };
      
                // Create an array of urls for all content files
                const urls = [];
                for (const contentGroup of DataManager.contentGroups) {
                    for (const path of paths) {
                        urls.push(`${path}/${contentGroup}.json`);
                    };            
                };

                // Cache all JSON files from all languages
                await cache.addAll(urls);
            }

            // Complete the content properties by merging data from base and english directories by default, overwriting english data if necessary, then finalizing abilities
            await dataManager.getContent(cache, "base");
            await dataManager.getContent(cache, dataManager.contentInfo.languages[0]);
            if (dataManager.userSettings.language !== dataManager.contentInfo.languages[0]) {
                await dataManager.getContent(cache, dataManager.userSettings.language);
            }

            // When going through ringRefs, in most cases, the first property ("any") of dataManager.content.rings should not be used
            // This should be used instead
            dataManager.individualRingRefs = Object.keys(dataManager.content.rings).splice(1, 5);

            dataManager.finalizeTechsAndAbilities();

            // MAKE IT POSSIBLE TO HAVE ONE FILE MISSING
        }
        else {
            // ERROR MESSAGE, CLOSE APPLICATION? <<<<<<<<<<<<<<<
        }
    }

    // Get contentInfo.json, which is an actual file from the content directory
    // It contains the last update time and an array of available content languages, the first of which is the default one
    async getContentInfo(cache) {
        const response = await cache.match(`./content/contentInfo.json`);
        if (response) {
            const contentInfo = await response.json();
            return contentInfo;
        }   
    }

    // Cache userSettings.json in the root directory
    // It will only exist in the cache
    async cacheUserSettings() {
        const cache = await caches.open(DataManager.cacheName);
        await cache.put("userSettings.json", new Response(JSON.stringify(dataManager.userSettings)));
    }

    // Get userSettings.json from the cache
    async getUserSettings(cache, languages) {
        const response = await cache.match(`./userSettings.json`);
        // If userSettings.json exists in the cache, assign the corresponding object to dataManager.userSettings
        if (response) {
            const userSettings = await response.json();
            if (userSettings.language === undefined || !languages.includes(userSettings.language)) {
                userSettings.language = new UserSettings(languages).language;
            }
            return userSettings;
        }
        // Otherwise create a new UserSettings
        else {
            return new UserSettings(languages);
        }
    }

    // Cache a character in ./characters/, in the form of familyName_personalName.json
    async cacheCharacter(character) {        
        const cache = await caches.open(DataManager.cacheName);
        await cache.put(`./characters/${dataManager.content.families[character.familyRef].name}_${character.personalName}.json`, new Response(JSON.stringify(character)));        
    }

    // Get an array of select options for the characters that exist in the cache
    async getAvailableCharacterOptions(cache) {
        const availableCharacterOptions = [];
        const cacheKeys = await cache.keys();
        for (const cacheKey of cacheKeys) {
            // for each JSON file in the cache, check if it is in /characters
            if (cacheKey.url.includes("/characters/")) {
                // If so, get the file name part from the url, then the character name
                const nameStartPosition = cacheKey.url.search("/characters/") + "/characters/".length;
                const characterName = cacheKey.url.slice(nameStartPosition, -5).replace("_", " ");

                // Create a new option, use the character name for both value and text property, and push it to the array
                const option = document.createElement("option");                
                option.value = characterName;
                option.text = characterName;                
                availableCharacterOptions.push(option);
            }
        };

        // Sort by name and return the availableCharacterOptions array
        availableCharacterOptions.sort(function(optionA, optionB) {
            if (optionA.text < optionB.text) {
                return -1;
            }
            else if (optionA.text > optionB.text) {
                return 1;
            }
            else {
                return 0;
            }
        });
        return availableCharacterOptions;
    }

    // Add an option corresponding to characterName, or remove it if it already exists
    changeCharacterAvailability(characterName) {

        const i = dataManager.availableCharacterOptions.findIndex(option => option.text === characterName);

        // If the character name already exists
        if (i > -1) {
            // Remove 1 item at index i
            dataManager.availableCharacterOptions.splice(i, 1);
        }
        else {
            const newCharacterOption = document.createElement("option");
            newCharacterOption.value = characterName;
            newCharacterOption.text = characterName;

            dataManager.availableCharacterOptions.push(newCharacterOption);
            dataManager.availableCharacterOptions.sort(function(optionA, optionB) {
                if (optionA.text < optionB.text) {
                    return -1;
                }
                else if (optionA.text > optionB.text) {
                    return 1;
                }
                else {
                    return 0;
                }
            });
        }
    }

    /*
    // If there is a parameter, characterName will be removed from the options if it exists (used when loading or deleting)
    // A latestCharacterName option will be added (used when loading or creating a new character) unless characterDeletion is true
    changeCharacterAvailability(characterName, characterDeletion) {

        const i = dataManager.availableCharacterOptions.findIndex(option => option.text === characterName);

        // If the character name already exists
        if (i > -1) {
            // Remove 1 item at index i
            dataManager.availableCharacterOptions.splice(i, 1);
        }

        if (!characterDeletion) {
            const latestCharacterOption = document.createElement("option");
            latestCharacterOption.value = dataManager.userSettings.latestCharacterName;
            latestCharacterOption.text = dataManager.userSettings.latestCharacterName;

            dataManager.availableCharacterOptions.push(latestCharacterOption);
            dataManager.availableCharacterOptions.sort(function(optionA, optionB) {
                if (optionA.text < optionB.text) {
                    return -1;
                }
                else if (optionA.text > optionB.text) {
                    return 1;
                }
                else {
                    return 0;
                }
            });
        }
    }
    */

    // Remove a character's JSON from the cache
    async deleteCharacter(characterName) {
        if ("caches" in window) {
            const cache = await caches.open(DataManager.cacheName);
            // Determine the JSON url using characterName
            const url = `./characters/${characterName.replace(" ", "_")}.json`;
            // If the character is deleted successfully, remove the corresponding character option using dataManager.changeCharacterAvailability
            const response = await cache.delete(url);
            if (response) {
                dataManager.changeCharacterAvailability(characterName);
                console.log("OK");
            }
            else {
                console.log("NOPE");
            }
        }
    }

    // Get content objects from the cache to the dataManager.content specified property
    async getContent(cache, directoryName) {
        const promises = DataManager.contentGroups.map(async contentGroup => {
            // For each content type, get a jsonObject from the cache using the the corresponding file path
            const response = await cache.match(`./content/${directoryName}/${contentGroup}.json`);
            const jsonObject = await response.json();
            // If a corresponding object doesn't exist in dataManager.content, create a new one
            if (dataManager.content[contentGroup] === undefined) {
                dataManager.content[contentGroup] = {};
            }
            // Combine the existing object with the data from jsonObject
            dataManager.combineContent(dataManager.content[contentGroup], jsonObject);
        });
        await Promise.all(promises);
    }

    // Combine existingObject with newObject
    combineContent(existingObject, newObject) {
        // If existingObject has properties, check every property in newObject
        if (Object.keys(existingObject).length > 0) {
            for (const propertyName of Object.keys(newObject)) {   
                // If the property exists and is an object, repeat the process for that object             
                if (existingObject[propertyName] !== undefined && typeof existingObject[propertyName] === "object") {
                    dataManager.combineContent(existingObject[propertyName], newObject[propertyName]);
                }
                // Otherwise, create it in existingObject, or replace it with the new value
                else {
                    existingObject[propertyName] = newObject[propertyName];
                }
            };
        }
        // If existingObject is empty, then content doesn't exist for this contentGroup, and we can assign newObject as is
        else {
            Object.assign(existingObject, newObject);
        }
    }

    // Create missing properties in techniques and abilities
    finalizeTechsAndAbilities() {
        // Make a shallow copy of Object.values(dataManager.content.techniques) that will be used to check for ringRef
        const completeArray = [...Object.values(dataManager.content.techniques)];

        // For each school, give abilities a groupRef, a rank, and an extra name
        for (const school of Object.values(dataManager.content.schools)) { 
            const abilityArray = [];

            school.initialAbility.groupRef = "schoolAbility";
            school.initialAbility.rank = 1;
            abilityArray.push(school.initialAbility);

            school.finalAbility.groupRef = "masteryAbility";
            school.finalAbility.rank = 6;
            abilityArray.push(school.finalAbility);

            // Use the school name as the extra name
            for (const ability of abilityArray) {
                ability.extraNames = {abilityOrigin: school.name};
                completeArray.push(ability);
            }
        }
        // For each title, give abilities a groupRef, a rank, and an extra name
        for (const title of Object.values(dataManager.content.titles)) {
            const abilityArray = [];

            // The ranks are set to 7 to place these abilities at the end of the list, but the number will not be displayed
            if (title.initialAbility !== undefined) {                
                title.initialAbility.rank = 7;                
                title.initialAbility.groupRef = "titleEffect";              
                // Because effects have no name, use the group name instead
                title.initialAbility.name = dataManager.content.ui.techniqueGroupNames[title.initialAbility.groupRef];
                abilityArray.push(title.initialAbility);
            }
            title.finalAbility.rank = 7;
            title.finalAbility.groupRef = "titleAbility";
            abilityArray.push(title.finalAbility);

            // Use the title name as the extra name
            for (const ability of abilityArray) {
                ability.extraNames = {abilityOrigin: title.name};
                completeArray.push(ability);
            }
        }
        // For each technique or ability, check the first activation string
        const keywords = dataManager.content.ui.activationKeywords;
        for (const techOrAbility of completeArray) {
            const checkedString = techOrAbility.activation[0].toLowerCase();

            // If no ringRef already exists, look for a better one in checkedString
            if (techOrAbility.ringRef === undefined) {                

                let foundRing = false;
                // In checkedString, look for a ring mention in parentheses
                for (const ringRef of dataManager.individualRingRefs) {
                    // If a ring is found, use the corresponding ringRef
                    if (checkedString.includes(`(${dataManager.content.rings[ringRef].name.toLowerCase()})`)) {
                        techOrAbility.ringRef = ringRef;
                        foundRing = true;
                        break;
                    }
                }
                // If no ring was found, try to find one using ringKeyword instead
                if (!foundRing) {
                    ringLoop:
                    for (const ringRef of dataManager.individualRingRefs) {
                        for (const ringKeyword of keywords.ring) {
                            if (checkedString.includes(ringKeyword) && checkedString.includes(dataManager.content.rings[ringRef].name.toLowerCase())) {
                                techOrAbility.ringRef = ringRef;
                                foundRing = true;
                                break ringLoop;
                            }
                        }                        
                    }
                }
                // If no ring was found either, use null
                if (!foundRing) {
                    techOrAbility.ringRef = null;
                }
            }

            techOrAbility.activationSet = new Set();

            // Look for activation cost keywords in checkedString, and add the corresponding words to techOrAbility.activationSet if found
            // These will be used later for icons and filtering
            for (const costKeyword of keywords.cost) {
                if (checkedString.includes(costKeyword)) {
                    for (const actionKeyword of keywords.action) {
                        if (checkedString.includes(actionKeyword)) {
                            techOrAbility.activationSet.add("action");
                        }
                    }
                    for (const downtimeKeyword of keywords.downtime) {
                        if (checkedString.includes(downtimeKeyword)) {
                            techOrAbility.activationSet.add("downtime");
                        }
                    }
                    for (const tnKeyword of keywords.tn) {
                        if (checkedString.includes(tnKeyword)) {
                            techOrAbility.activationSet.add("tn");
                        }
                    }
                    /* SKILL GROUP OPPORTUNITIES FOR TECHNIQUES NEVER SEEM RIGHT: DELETE?
                    const groupRefs = [];
                    for (const skill of Object.values(dataManager.content.skills)) {
                        if (checkedString.includes(skill.name.toLowerCase())) {
                            groupRefs.push(skill.groupRef);
                        }
                    }
                    if (groupRefs.length === 0) {
                        for (const groupRef of Object.keys(dataManager.content.ui.skillGroups)) {
                            const skillGroup = dataManager.content.ui.skillGroups[groupRef];
                            if (checkedString.includes(skillGroup.name.toLowerCase()) || checkedString.includes(skillGroup.skill.toLowerCase())) {
                                groupRefs.push(groupRef);
                            }
                        }
                    }                    
                    for (const groupRef of groupRefs) {
                        techOrAbility.activationSet.add(groupRef);
                    }
                    */
                }
                else {
                    for (const opportunityKeyword of keywords.opportunity) {
                        if (checkedString.includes(opportunityKeyword)) {
                            techOrAbility.activationSet.add("opportunity");
                        }
                    }
                }                
            }
            
            for (const voidPointKeyword of keywords.voidPoint) {
                if (checkedString.includes(voidPointKeyword)) {
                    techOrAbility.activationSet.add("void");
                }
            }
            for (const timesPerKeyword of keywords.timesPer) {
                if (checkedString.includes(timesPerKeyword)) {
                    techOrAbility.activationSet.add("limited");
                }
            }
            if (techOrAbility.activationSet.size === 0) {
                techOrAbility.activationSet.add("permanent");
            }
        }
    }
    
    // Change the UI language based on the language element
    async changeLanguage() {

        // Change the language to the one selected in the language element, and modify userSettings accordingly
        const cache = await caches.open(DataManager.cacheName);
        dataManager.userSettings.language = document.getElementById("language").value;
        dataManager.cacheUserSettings();

        // Replace the language-dependant content
        await dataManager.getContent(cache, dataManager.userSettings.language);
        dataManager.finalizeTechsAndAbilities();

        // Update the display
        displayManager.initialize(true);
        if (dataManager.current.character !== undefined) {
            displayManager.clearContent();
            displayManager.loadTab(dataManager.userSettings.currentTabClass);
        }        
        
        // Change the page language to reflect userSettings
        document.documentElement.lang = dataManager.userSettings.language;
    }

    // Get the cost in XP to learn or upgrade content
    getUpgradeCost(content, alreadyAcquired) {

        const ringCostPerRank = 3;
        const skillCostPerRank = 2;
        const defaultTechCost = 3;

        let modifier = 1;
        if (alreadyAcquired) {
            modifier = 0;
        }

        if (Object.values(dataManager.content.rings).includes(content)) {
            return ringCostPerRank * (dataManager.current.ringPairMaps.all.get(content) + modifier);
        }
        else if (Object.values(dataManager.content.skills).includes(content)) {
            return skillCostPerRank * (dataManager.current.skillPairMaps.all.get(content) + modifier);
        }
        else if(content.xpCost === undefined) {
            return defaultTechCost;
        }
        else {            
            return content.xpCost;
        }
    }

    getCharacterFromJsonObject(jsonObject) {

        const character = new Character();
        
        // If jsonObject is missing a property, delete the character and load the next one, or open character creation
        for (const characterProperty of Object.keys(character)) {
            if (!Object.keys(jsonObject).includes(characterProperty)) {
                deleteCharacter(characterObjOrName);
                // TRY TO LOAD OTHER EXISTING CHARACTERS BEFORE ASKING FOR CHARACTER CREATION
                displayManager.createCharacter();
                return;
            }
        }
        
        // If jsonObject has an extra property, delete it
        const expectedProperties = Object.keys(character);
        expectedProperties.push("_voidPoints");                
        for (const jsonProperty of Object.keys(jsonObject)) {
            if (!expectedProperties.includes(jsonProperty)) {
                delete jsonObject.jsonProperty;
                console.log(jsonProperty + " property deleted");
            }
        }

        Object.assign(character, jsonObject);
        return character;
    }

    // Update character userSettings, current character, and collections in dataManager.current
    // Update the display (header and tabs)
    // Without a parameter, this resets the current character progress to creation state with all XP unspent
    // This also needs to run when a new title is added
    async loadOrResetCharacter(characterObjOrName) {

        let character;
        if (characterObjOrName != null) {
            if (typeof characterObjOrName === "string") {
                const cache = await caches.open(DataManager.cacheName);
                // Get the file name from the character's name and try to find it in the cache
                const jsonName = `${characterObjOrName}.json`.replace(" ","_"); 
                const response = await cache.match(`./characters/${jsonName}`);
                // If the json file exists in the cache, assign the corresponding object to dataManager.current.character
                if (response) {

                    // TEMPORARY TO REMOVE UPPERCASE IN OLD SAVES. DELETE THIS PART THEN RESTORE TRUE JSONOBJECT LINE
                    let responseString = await response.text();
                    const contentCategories = ["families", "techniques", "titles", "traits"];
                    for (const categoryName of contentCategories) {
                        for (const propertyName of Object.keys(dataManager.content[categoryName])) {
                            const regex = new RegExp(propertyName, 'gi');
                            responseString = responseString.replace(regex, propertyName);
                        }
                    }
                    const jsonObject = JSON.parse(responseString);

                    //const jsonObject = await response.json();
                    character = dataManager.getCharacterFromJsonObject(jsonObject);
                }
                else {
                    // ERROR MESSAGE?
                }
            }
            else {
                character = characterObjOrName;
            }

            const characterName = dataManager.content.families[character.familyRef].name + " " + character.personalName;
            dataManager.userSettings.latestCharacterName = characterName;        
            dataManager.cacheUserSettings();
            dataManager.current.character = character;
        }
        else {
            character = dataManager.current.character;
            const schoolRef = Object.keys(character.learningLists)[0];
            character.learningLists = {};
            character.learningLists[schoolRef] = [];
            dataManager.cacheCharacter(dataManager.current.character);
        }

        // Spent XP and progress XP start from 0 and will change automatically based on character.learningLists
        dataManager.current.spentXp = 0;

        // An institution is an object that could be the school or a title, as they share some properties
        // The following Maps will have intitutionRefs as keys
        dataManager.current.institutionSkills = new Map(); // Values will be arrays of skill Sets
        dataManager.current.institutionTechs = new Map(); // Values will be arrays of technique Sets
        dataManager.current.institutionProgress = new Map(); // Values will be objects defined below

        // Go through every institutionRef key of character.learningLists
        for (const institutionRef of Object.keys(character.learningLists)) {
            
            // Complete the various Maps
            dataManager.current.institutionSkills.set(institutionRef, []);
            dataManager.current.institutionTechs.set(institutionRef, []);
            const progressObj = {
                progressXp: 0,
                rank: 1
            };
            dataManager.current.institutionProgress.set(institutionRef, progressObj)

            let institution;            
            // Find the right institution object in dataManager.content
            if (institutionRef === Object.keys(character.learningLists)[0]) {
                institution = dataManager.content.schools[institutionRef];                
            }
            else {
                institution = dataManager.content.titles[institutionRef];
            }
            
            // Loop through each rank in institution.curriculum
            for (let i = 0; i < institution.curriculum.length; i++) {

                // The following Sets will contain skills and techniques for this rank
                const skillSet = new Set();
                const techSet = new Set();

                // Loop through all the strings in institution.curriculum[i].list
                for (const refString of institution.curriculum[i].list) {
                    // If it starts with "S: ", it is an individual skill: add it to skillSet after removing the prefix
                    if (refString.startsWith("S: ")) {                        
                        const skill = dataManager.content.skills[refString.slice(3)];
                        skillSet.add(skill);
                    }
                    // If it starts with "SG: ", it is a group of skills
                    // Find every skill that belongs to it and add the corresponding skill to skillSet
                    else if (refString.startsWith("SG: ")) {                        
                        const groupRef = refString.slice(4);
                        for (const skill of Object.values(dataManager.content.skills)) {
                            if (skill.groupRef === groupRef) {
                                skillSet.add(skill);
                            }
                        }
                    }
                    // If it starts with "T: ", it is an individual technique: add it to techSet after removing the prefix
                    if (refString.startsWith("T: ")) {                        
                        const tech = dataManager.content.techniques[refString.slice(3)];
                        techSet.add(tech);
                    }
                    else if (refString.startsWith("TG: ")) {
                        // If it starts with "TG: ", it is a group of techniques
                        // Find every technique that belongs to it and add the corresponding technique to techSet unless there is a clan restriction
                        const groupString = refString.slice(4).split(" ").reverse();
                        const ringRef = groupString[2];
                        const groupRef = groupString[1];
                        const maxRank = parseInt(groupString[0]);
                        for (const tech of Object.values(dataManager.content.techniques)) {
                            if ((!ringRef || tech.ringRef === ringRef) && tech.groupRef === groupRef && tech.rank <= maxRank && (!tech.clanRef || tech.clanRef === dataManager.current.character.clanRef)) {
                                techSet.add(tech);
                            }
                        }
                    }
                }

                // Add skillSet and techSet to the institutionSkills.get(institutionRef) and institutionTechs.get(institutionRef) arrays respectively
                // Because institution ranks starts at 1, a Set with index i corresponds to a school or title rank of i + 1
                dataManager.current.institutionSkills.get(institutionRef).push(skillSet);
                dataManager.current.institutionTechs.get(institutionRef).push(techSet);
            }
        }        

        //Add starting rings, skills and techniques to their respective collections        
        dataManager.current.ringPairMaps.all = new Map(); // Map with rings as keys, and ring ranks as int values
        for (const ringRef of Object.keys(character.startingRingsObj)) {
            dataManager.current.ringPairMaps.all.set(dataManager.content.rings[ringRef], character.startingRingsObj[ringRef]);
        }
        dataManager.current.skillPairMaps.all = new Map(); // Map with skills as keys, and skill ranks as int values
        for (const skillRef of Object.keys(dataManager.content.skills)) {
            if (Object.keys(character.startingSkillsObj).includes(skillRef)) {
                dataManager.current.skillPairMaps.all.set(dataManager.content.skills[skillRef], character.startingSkillsObj[skillRef]);
            }
            else {
                dataManager.current.skillPairMaps.all.set(dataManager.content.skills[skillRef], 0);
            }
        }
        dataManager.current.techSets.learned = new Set(); // Set of techs
        for (const techRef of character.startingTechRefs) {
            dataManager.current.techSets.learned.add(dataManager.content.techniques[techRef]);
        } 
        
        // Use updateFilteredCollections to update the other dataManager.current collections
        dataManager.updateFilteredCollections(character.learningLists);
        
        displayManager.updateLayout(character);

        const intro = document.getElementById("intro");
        if (intro != null) {
            document.getElementById("intro").remove();
        }
    }

    // This runs every time the character learns something to update dataManager.current collections
    // Also updates tab display
    updateFilteredCollections(learningLists) {

        // learningLists should be an object with institutionRefs as property names and string arrays as values, with prefixes for each refString
        // In the case of individual upgrades, it is a new object with every character.learningLists property, but empty arrays except for one string in one of them

        // Create shortcuts
        const institutionSkills = dataManager.current.institutionSkills;
        const institutionTechs = dataManager.current.institutionTechs;
        const institutionProgress = dataManager.current.institutionProgress;
        const allRings = dataManager.current.ringPairMaps.all;
        const allSkills = dataManager.current.skillPairMaps.all;
        const learnedTechs = dataManager.current.techSets.learned;

        // Create Sets that will store skills and techniques
        // The filtered collections will be based on these
        let oldSkills = new Set();
        let rankSkills = new Set();
        let futureSkills = new Set();
        let oldTechs = new Set();
        let rankTechs = new Set();
        let futureTechs = new Set();

        // Go through every institutionRef of learningLists keys (school first)
        let isSchoolRef = true;        
        for (const institutionRef of Object.keys(learningLists)) {

            // Find the corresponding institution object in dataManager.content
            let institution;
            if (isSchoolRef) {
                institution = dataManager.content.schools[institutionRef];
                isSchoolRef = false;
            }
            else {
                institution = dataManager.content.titles[institutionRef];
            }

            // Set int variables
            let previousRanksXp = 0;
            let learningIndex = 0;
            institutionProgress.get(institutionRef).rank = 1;

            // Add initial abilities to learned and old techniques
            if (institution.initialAbility !== undefined) {
                learnedTechs.add(institution.initialAbility);
                oldTechs.add(institution.initialAbility);
            }
            // Add final abilities to future techniques, as they are unavailable until automatically learned
            futureTechs.add(institution.finalAbility);

            // Loop through each rank in each curriculum, and check whether elements from the learningLists[institutionRef] array are in the curriculum
            for (let i = 0; i < institution.curriculum.length; i++) {

                const nextXpThreshold = previousRanksXp + institution.curriculum[i].rankUpCost;
                
                function learnMore() {
                    // There are still things to learn in learningLists[institutionRef]:
                    const thingsToLearn = learningIndex < learningLists[institutionRef].length
                    // This rank has not been completed yet:
                    const incompleteRank = institutionProgress.get(institutionRef).progressXp < nextXpThreshold
                    // This is the final rank before completion:
                    const finalRank = i === institution.curriculum.length - 1;

                    return thingsToLearn && (incompleteRank || finalRank);
                }                

                // This next part is skipped until the current rank is reached (incompleteRank becomes true)
                // If the curriculum gets completed, finalRank stays true: finish learning from learningLists[institutionRef], progress xp becomes irrelevant
                
                while (learnMore()) {
                    // Add everything that is learned for this rank to the corresponding maps or set, and calculate XP cost and institution progress
                    
                    let refString = learningLists[institutionRef][learningIndex];
                    let F = false;
                    let C = false;
                    // F stands for free. This means what is learned doesn't cost nor contribute experience points
                    if (refString.startsWith("F")) {
                        refString = refString.slice(1);
                        F = true;
                    }
                    // C stands for curriculum. This means the associated skill or technique is treated as if it was in the curriculum
                    else if (refString.startsWith("C")) {
                        refString = refString.slice(1);
                        C = true;
                    }

                    // The content variable can be a ring, skill or technique
                    let content;
                    // The isPartOfCurriculum variable always stays false for rings
                    let isPartOfCurriculum = false;

                    if (refString.startsWith("R: ")) {
                        content = dataManager.content.rings[refString.slice(3)];
                        allRings.set(content, allRings.get(content) + 1);
                    }
                    else if (refString.startsWith("S: ")) {
                        content = dataManager.content.skills[refString.slice(3)];
                        allSkills.set(content, allSkills.get(content) + 1);
                        if (institutionSkills.get(institutionRef)[i].has(content)) {
                            isPartOfCurriculum = true;
                        }
                    }
                    else { // refString.startsWith("T: ")
                        content = dataManager.content.techniques[refString.slice(3)];
                        learnedTechs.add(content);
                        if (institutionTechs.get(institutionRef)[i].has(content)) {
                            isPartOfCurriculum = true;
                        }
                    }
                    
                    // If the upgrade is not free, calculate its XP cost and the associated institution progress
                    if (!F) {
                        const cost = dataManager.getUpgradeCost(content, true);
                        dataManager.current.spentXp += cost;
                        if (isPartOfCurriculum || C) {
                            institutionProgress.get(institutionRef).progressXp += cost;
                        }
                        else {
                            institutionProgress.get(institutionRef).progressXp += cost/2;
                        }
                    }

                    learningIndex += 1;
                }

                // Determine whether the skills and techs in institutionSkills and institutionTechs belong to a future rank, the current rank, or a past rank
                // If this rank has not been reached
                if (institutionProgress.get(institutionRef).progressXp < previousRanksXp) {                    
                    futureSkills = new Set([...futureSkills, ...institutionSkills.get(institutionRef)[i]]);
                    futureTechs = new Set([...futureTechs, ...institutionTechs.get(institutionRef)[i]]);
                }
                // If this rank has been reached but has not been completed
                else if (institutionProgress.get(institutionRef).progressXp < nextXpThreshold) {                    
                    rankSkills = new Set([...rankSkills, ...institutionSkills.get(institutionRef)[i]]);
                    rankTechs = new Set([...rankTechs, ...institutionTechs.get(institutionRef)[i]]);
                }
                // If this rank has been completed
                else {                    
                    oldSkills = new Set([...oldSkills, ...institutionSkills.get(institutionRef)[i]]);
                    oldTechs = new Set([...oldTechs, ...institutionTechs.get(institutionRef)[i]]);  
                    
                    // Increase institution rank each loop until it gets to its true value of the current rank
                    if (institutionProgress.get(institutionRef).progressXp >= nextXpThreshold) {
                        institutionProgress.get(institutionRef).rank += 1;                    
                    }

                    // If the final rank belongs to the past, then the curriculum is complete: unlock the final ability of this institution
                    if (i === institution.curriculum.length - 1) {
                        learnedTechs.add(institution.finalAbility);
                    }
                }
                
                // Increase previousRanksXp before going through the loop again
                previousRanksXp = nextXpThreshold;
            }
        }

        // MODIFY TO CHANGE ONLY THE NECESSARY COLLECTIONS?

        // In the next part, we will update various collections from dataManager.current

        // Update the map of all upgradable rings (ring ranks >= 5 not included)
        dataManager.current.ringPairMaps.upgradable = new Map([...dataManager.current.ringPairMaps.all].filter(pair => pair[1] < 5));

        // Update the map of all known skills
        dataManager.current.skillPairMaps.learned = new Map([...dataManager.current.skillPairMaps.all].filter(pair => pair[1] > 0));

        // Update the map of all upgradable skills (skill ranks >= 5 not included)
        dataManager.current.skillPairMaps.upgradable = new Map([...dataManager.current.skillPairMaps.all].filter(pair => pair[1] < 5));

        // Update the map of all curricula skills
        dataManager.current.skillPairMaps.included = new Map([...dataManager.current.skillPairMaps.all].filter(pair => new Set([...oldSkills, ...rankSkills, ...futureSkills]).has(pair[0])));

        // Update the map of all skills that fully contribute to the school or a title
        dataManager.current.skillPairMaps.rank = new Map([...dataManager.current.skillPairMaps.included].filter(pair => rankSkills.has(pair[0])));

        // Update the set of all known techniques
        dataManager.current.techSets.learned = learnedTechs;

        const compatibleTechsBase = new Set();
        for (const tech of Object.values(dataManager.content.techniques)) {
            if (dataManager.current.character.school.techniqueGroupRefs.includes(tech.groupRef) && (tech.clanRef === undefined || dataManager.current.character.clanRef === tech.clanRef)) {
                compatibleTechsBase.add(tech);
            }
        }
        // Update the set of all compatible techniques (learned not included)
        dataManager.current.techSets.compatible = new Set([...new Set([...compatibleTechsBase, ...rankTechs, ...futureTechs])].filter(x => !learnedTechs.has(x)));

        const availableTechsBase = new Set();
        for (const tech of compatibleTechsBase) {
            if (tech.rank <= dataManager.current.institutionProgress.get(Object.keys(dataManager.current.character.learningLists)[0]).rank) {
                availableTechsBase.add(tech);
            }
        }
        // Update the set of all available techniques (learned not included)
        dataManager.current.techSets.available = new Set([...new Set([...availableTechsBase, ...rankTechs])].filter(x => !learnedTechs.has(x)));

        // Update the set of all curricula techniques
        dataManager.current.techSets.included = new Set([...oldTechs, ...rankTechs, ...futureTechs]);

        // Update the set of all techniques that fully contribute to the school or a title
        dataManager.current.techSets.rank = rankTechs;

        // Update the set of all missable techniques
        dataManager.current.techSets.missable = new Set([...dataManager.current.techSets.included].filter(x => !compatibleTechsBase.has(x) && x.groupRef !== "schoolAbility" && x.groupRef !== "masteryAbility" && x.groupRef !== "titleEffect" && x.groupRef !== "titleAbility"));
    
        displayManager.clearContent();
        displayManager.loadTab(dataManager.userSettings.currentTabClass);
    }
}

class DisplayManager {

    constructor() {
        // Singleton pattern
        if (DisplayManager.instance) {
            return DisplayManager.instance;
        }
        DisplayManager.instance = this;

        this.overlays = {
            primary: {
                background: document.getElementById("primaryBackground"),
                viewer: document.getElementById("primaryViewer")            
            },
            secondary: {
                background: document.getElementById("secondaryBackground"),
                viewer: document.getElementById("secondaryViewer")            
            },
            styles: {
                create: {heightString: "100%", widthString: "100%", class: "create"},
                consult: {heightString: "80%", widthString: "98%", class: "consult"},
                confirm: {heightString: "35%", widthString: "100%", class: "confirm"}
            },
            // The following array contains none, one or both of the overlays, from bottom to top
            visible: []
        };

        this.profile = {
            container: document.getElementById("profilePage")
        };
        this.rings = {
            container: document.getElementById("ringPage")
        };
        this.skills = {
            container: document.getElementById("skillList"),
            last: null, // li element
        };
        this.techniques = {
            container: document.getElementById("techniqueList"),
            last: null // li element
        };
        this.traits = {
            container: document.getElementById("traitList"),
            last: null // li element
        };
        this.equipment = {
            container: document.getElementById("equipmentList")
        };
        this.progress = {
            container: document.getElementById("progressPage")
        };

        // this.unload is used in the loadTab function and specifies which tab's content should be unloaded when switching to another tab
        this.unload = {
            profile: true,
            rings: false,
            skills: false,
            techniques: false,
            traits: true,
            equipment: true,
            progress: true,
            
        };
    }

    // This function sets form content to the last state according to dataManager.userSettings.values
    initialize(languageChanged) {
        
        if (languageChanged && dataManager.current.character !== undefined) {
            document.getElementById("school").textContent = dataManager.content.schools[Object.keys(dataManager.current.character.learningLists)[0]].name;
        }
        
        for (const filterName of [
            "skillGroupFilter",
            "skillRankFilter",
            "skillAvailabilityFilter",
            "skillCurriculaFilter",
            "techRankFilter",
            "techGroupFilter",
            "techRingFilter",
            "techActivationFilter",
            "techAvailabilityFilter",
            "techCurriculaFilter",
            "traitGroupFilter",
            "traitRingFilter",
            "traitTypeFilter",
            "traitAvailabilityFilter"
        ]) {
            const selectElement = document.getElementById(filterName);
            // If languageChanged, replace existing options for each filter
            if (languageChanged) {
                let i = 0;
                for (const option of selectElement.options) {
                    Object.assign(option, dataManager.content.ui[filterName][i]);
                    i++;
                }
            }
            // Otherwise, create new options and set filter values
            else {
                for (const obj of dataManager.content.ui[filterName]) {
                    const option = document.createElement("option");
                    Object.assign(option, obj);
                    selectElement.options.add(option);
                }
                // If there is a stored value in dataManager.userSettings, use it
                if (dataManager.userSettings.values[filterName] !== undefined) {
                    document.getElementById(filterName).value = dataManager.userSettings.values[filterName];
                }
                // Otherwise, use the first option
                else {
                    document.getElementById(filterName).value = selectElement.options[0].value;
                }
            }
        }
    }

    // In a specific tab, remove elements that have been added through this script
    // If no tab is specified, clear every tab    
    clearContent(tabClass) {
        let tabClassArray;
        if (tabClass !== undefined) {
            tabClassArray = [tabClass];
        }
        else {
            tabClassArray = Object.keys(displayManager.unload);
        }

        for (const tabClass of tabClassArray) {
            displayManager[tabClass].container.innerHTML = "";
        }        
    }

    // Display the specified tab's elements, and remove the previous tab's elements if that tab should be unloaded according to displayManager.unload
    loadTab(newTabClass) {
        
        if (newTabClass !== dataManager.userSettings.values.currentTabClass) {

            // Depending on whether newTabClass is defined, update currentTabClass and cache it, or update newTabClass
            if(newTabClass !== undefined) {

                // Remove "currentTab" from the previous tab
                for (const element of document.getElementsByClassName(dataManager.userSettings.values.currentTabClass)) {
                    element.classList.remove("currentTab");
                }
                // If some of the previous tab's elements should be removed, do so
                if (displayManager.unload[dataManager.userSettings.values.currentTabClass]) {
                    displayManager.clearContent(dataManager.userSettings.values.currentTabClass);
                }
                dataManager.userSettings.values.currentTabClass = newTabClass; 
                dataManager.cacheUserSettings();
            }
            else {
                newTabClass = dataManager.userSettings.values.currentTabClass;
            }
            // Add "currentTab" to the new tab
            for (const element of document.getElementsByClassName(newTabClass)) {
                element.classList.add("currentTab");
            }
        }
        // If the new tab has elements missing, add them
        // IS THERE A WAY TO CALL A FUNCTION IF ITS NAME ENDS WITH NEWTABCLASS? IF SO, RENAME AND SIMPLIFY
        switch(newTabClass) {
            case "profile":
                if (displayManager.profile.container.children.length === 0) {
                    displayManager.displayProfile();
                }
                break;            
            case "rings":
                if (displayManager.rings.container.children.length === 0) {
                    displayManager.displayRings();
                }
                break;
            case "skills":
                if (displayManager.skills.container.children.length === 0) {
                    displayManager.displaySkills();
                }
                break;
            case "techniques":
                if (displayManager.techniques.container.children.length === 0) {
                    displayManager.displayTechniques();
                }
                break;
            case "traits":
                if (displayManager.traits.container.children.length === 0) {
                    displayManager.displayTraits();
                }
                break;
            case "equipment":
                if (displayManager.equipment.container.children.length === 0) {                    
                    // ADD FUNCTION
                }
                break;
            case "progress":
                if (displayManager.progress.container.children.length === 0) {
                    displayManager.displayProgress();
                }
        }
    }

    // Opens an unused overlay or the bottom one if both are used, and returns it
    openViewer(style, optionalOriginElement) {

        let overlay;
        if (displayManager.overlays.visible.length !== 1) {
            if (displayManager.overlays.visible.length === 0) {
                overlay = displayManager.overlays.primary;
                displayManager.overlays.visible.push(overlay);
            }
            else {
                // If the array contains both overlays, remove the bottom one and add it again on top with openSecondViewer
                displayManager.overlays.visible[0].background.classList.remove("visible");
                displayManager.overlays.visible[0].viewer.classList.remove("visible");
                displayManager.overlays.visible[0].viewer.classList.remove("disabled");
                displayManager.overlays.visible.shift();
                openSecondViewer();
            }
            displayManager.overlays.visible[0].background.style.setProperty("z-index", 1);
            displayManager.overlays.visible[0].viewer.style.setProperty("z-index", 2);
        }
        else {
            openSecondViewer();
        }
        function openSecondViewer() {
            displayManager.overlays.visible[0].viewer.classList.add("disabled");
            if (displayManager.overlays.visible[0] === displayManager.overlays.primary) {
                overlay = displayManager.overlays.secondary;
            }
            else {
                overlay = displayManager.overlays.primary;
            }
            displayManager.overlays.visible.push(overlay);
            overlay.background.style.setProperty("z-index", 3);
            overlay.viewer.style.setProperty("z-index", 4);
        }

        document.getElementById("main").classList.add("disabled");

        if (overlay === displayManager.overlays.primary) {
            document.querySelector(":root").style.setProperty("--primaryViewerHeight", style.heightString);
            document.querySelector(":root").style.setProperty("--primaryViewerWidth", style.widthString);
            if (optionalOriginElement != null) {
                document.querySelector(":root").style.setProperty("--primaryViewerOrigin", optionalOriginElement.getBoundingClientRect().top + "px");
            }
            else {
                document.querySelector(":root").style.setProperty("--primaryViewerOrigin", "50%");
            }
        }            
        else {
            document.querySelector(":root").style.setProperty("--secondaryViewerHeight", style.heightString);
            document.querySelector(":root").style.setProperty("--secondaryViewerWidth", style.widthString);
            if (optionalOriginElement != null) {
                document.querySelector(":root").style.setProperty("--secondaryViewerOrigin", optionalOriginElement.getBoundingClientRect().top + "px");
            }
            else {
                document.querySelector(":root").style.setProperty("--secondaryViewerOrigin", "50%");
            }
        }
        overlay.viewer.classList.remove("consult");
        overlay.viewer.classList.remove("confirm");
        overlay.viewer.classList.add(style.class);

        // Display the background and viewer           
        overlay.background.classList.add("appear");
        overlay.viewer.classList.add("appear");

        // Clear the viewer
        overlay.viewer.innerHTML = "";

        return overlay;
    }

    // At the end of an animation, toggle overlay "visible" class, and remove animation specific classes
    toggleOverlayVisibility(overlay) {
        overlay.background.classList.toggle("visible");
        overlay.viewer.classList.toggle("visible");
        overlay.background.classList.remove("appear");
        overlay.viewer.classList.remove("appear");
        overlay.background.classList.remove("disappear");
        overlay.viewer.classList.remove("disappear");

        const primaryNotVisible = !displayManager.overlays.primary.background.classList.contains("visible");
        const secondaryNotVisible = !displayManager.overlays.secondary.background.classList.contains("visible")
        if (primaryNotVisible) {
            displayManager.overlays.secondary.viewer.classList.remove("disabled");
        }        
        if (secondaryNotVisible) {
            displayManager.overlays.primary.viewer.classList.remove("disabled");
        }
        if (primaryNotVisible && secondaryNotVisible) {
            document.getElementById("main").classList.remove("disabled");
        }
    }

    // This function is called when closing a viewer, either by clicking the background, or a button
    // When both overlays are visible, this hides the top one
    // The parameter can either be the target of the background click, or the overlay object through a button click event
    hideOverlay(target) {

        let overlay;
        // If a button was clicked
        if (target === displayManager.overlays.primary || target === displayManager.overlays.secondary) {
            overlay = target;
        }
        // If a background has been clicked, determine which one
        else if (target !== undefined) {
            if (displayManager.overlays.primary.background.contains(target) && !displayManager.overlays.primary.viewer.contains(target)) {
                overlay = displayManager.overlays.primary;
            }
            else if (displayManager.overlays.secondary.background.contains(target) && !displayManager.overlays.secondary.viewer.contains(target)) {
                overlay = displayManager.overlays.secondary;
            }
            else {
                return;
            }
        }        
        // Once we know overlay, make background and viewer disappear, remove the top element and reset the viewer scroll value
        overlay.background.classList.add("disappear");
        overlay.viewer.classList.add("disappear");
        displayManager.overlays.visible.pop();
        overlay.viewer.scrollTop = 0;
    }

    // For strings of the properties array, add the corresponding class
    // For pairs of the properties array, add the corresponding property with the specified value
    styleElement(element, styleArray) {
        for (const styleData of styleArray) {
            if (typeof styleData === "string") {
                element.classList.add(styleData);
            }
            else {
                element.style.setProperty(styleData[0], styleData[1]);
            }
        }
    }

    // Create, append and return an element of the specified type with the specified text and styling
    // Default type is span
    createTextElement(parentElementOrArray, type, text, styleArray) {

        let element;
        if (type !== undefined) {
            element = document.createElement(type);
        }
        else {
            element = document.createElement("span");
        }
        element.textContent = text;
        if (styleArray !== undefined) {
            displayManager.styleElement(element, styleArray);
        }
        if (parentElementOrArray !== undefined) {
            if (parentElementOrArray.constructor === Array) {
                parentElementOrArray.push(element);
            }
            else {
                parentElementOrArray.appendChild(element);
            }            
        }
        return element;
    }

    // Create, append and return a button with the specified text and onclick function
    createButton(parentElementOrArray, text, onclick, styleArray) {
        const button = displayManager.createTextElement(parentElementOrArray, "button", text, styleArray);
        button.onclick = onclick;
        return button;
    }

    // Create, append and return an element of the specified type with the specified styling
    // Default type is div
    createContainer(parentElementOrArray, type, styleArray) {

        let container;
        if (type !== undefined) {
            container = document.createElement(type);
        }
        else {
            container = document.createElement("div");
        }
        if (styleArray !== undefined) {
            displayManager.styleElement(container, styleArray);
        }
        if (parentElementOrArray !== undefined) {
            if (parentElementOrArray.constructor === Array) {
                parentElementOrArray.push(container);
            }
            else {
                parentElementOrArray.appendChild(container);
            }            
        }
        return container;
    }

    createFlexContainer(parentElementOrArray, type, styleArray) {

        const container = displayManager.createContainer(parentElementOrArray, type, styleArray);
        container.style.setProperty("display", "flex");
        return container;
    }

    createFlexLineContainer(parentElementOrArray, type, styleArray) {

        const container = displayManager.createFlexContainer(parentElementOrArray, type, styleArray);
        container.style.setProperty("gap", "0.5em");
        container.style.setProperty("align-items", "center");
        return container;
    }

    createFlexColumnContainer(parentElementOrArray, type, styleArray) {

        const container = displayManager.createFlexContainer(parentElementOrArray, type, styleArray);
        container.style.setProperty("flex-direction", "column");
        return container;
    }

    createGridContainer(parentElementOrArray, type, styleArray) {

        const container = displayManager.createContainer(parentElementOrArray, type, styleArray);
        container.style.setProperty("display", "grid");
        return container;
    }

    // Create and return a select element with the specified options
    createSelect(parentElementOrArray, optionRefs, optionTextObject, propertyName) {

        const select = document.createElement("select");                    
        for (const optionRef of optionRefs) {
            const option = document.createElement("option");
            option.value = optionRef;
            option.text = optionTextObject[optionRef][propertyName];                        
            select.options.add(option);
        }
        if (parentElementOrArray !== undefined) {
            if (parentElementOrArray.constructor === Array) {
                parentElementOrArray.push(select);
            }
            else {
                parentElementOrArray.appendChild(select);
            }            
        }
        return select;
    }

    createCheckbox(parentElementOrArray, onchange) {

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";

        if (onchange !== undefined) {
            checkbox.onchange = onchange;
        }

        if (parentElementOrArray !== undefined) {
            if (parentElementOrArray.constructor === Array) {
                parentElementOrArray.push(checkbox);
            }
            else {
                parentElementOrArray.appendChild(checkbox);
            }            
        }
        return checkbox;
    }

    // Create and return a clickable icon to consult content
    createConsultIcon(parentElementOrArray, refOrObj, contentGroup) {

        const consultIcon =  displayManager.createTextElement(parentElementOrArray, "span", String.fromCharCode(dataManager.content.ui.customIcons.consultIcon), ["alignCenter", "largeFontSize", "pointer"]);
        consultIcon.onclick = () => displayManager.consultContent(consultIcon, refOrObj, contentGroup, null, true);
        return consultIcon;
    }

    // This function is called when clicking the character header
    characterChoice() {
        
        const currentOverlay = displayManager.openViewer(displayManager.overlays.styles.confirm, document.getElementById("characterHeader"));

        // Create the fragment that will contain the new viewer elements
        const fragment = document.createDocumentFragment();
        
        const characterDataContainer = displayManager.createGridContainer(fragment, "div", [["gap", "0.5em"], ["grid-template-columns", "auto auto"]]);

        const newButton = displayManager.createButton(characterDataContainer, dataManager.content.ui.characterChoice.new, () => {
            displayManager.createCharacter(newButton);
        }, [["grid-column", "span 2"]]);        

        const fileInput = document.createElement("input");        
        characterDataContainer.appendChild(fileInput);
        fileInput.type = "file";
        fileInput.accept = ".json";
        fileInput.onchange = () => {

            const file = fileInput.files[0];
            if (!file) {
                return;
            }  

            const reader = new FileReader();
            reader.readAsText(file);
            reader.onload = (event) => {
                const content = event.target.result;            
                const jsonObject = JSON.parse(content);
                const character = dataManager.getCharacterFromJsonObject(jsonObject);                
                dataManager.cacheCharacter(character);
                dataManager.changeCharacterAvailability(dataManager.content.families[character.familyRef].name + " " + character.personalName);
                dataManager.loadOrResetCharacter(character);
                displayManager.hideOverlay(currentOverlay);
            };              
        }        
        fileInput.style.setProperty("display", "none");
        const importButton = displayManager.createButton(characterDataContainer, dataManager.content.ui.characterChoice.import, () => {
            fileInput.click();
        });

        if (dataManager.current.character != null) {
            displayManager.createButton(characterDataContainer, dataManager.content.ui.characterChoice.export, () => {
                const character = dataManager.current.character;    
                // Convert JSON to string
                var jsonString = JSON.stringify(character);    
                // Create a Blob containing the JSON data and specify type as application/json
                var blob = new Blob([jsonString], { type: 'application/json' });
                // Create and trigger a link element
                var link = document.createElement('a');
                link.href = window.URL.createObjectURL(blob);
                link.download = `${dataManager.content.families[character.familyRef].name}_${character.personalName}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        }
        else {
            importButton.style.setProperty("grid-column", "span 2");
        }       

        const characterSelectionContainer = displayManager.createContainer(fragment, "div", [["display", "none"], ["gap", "0.5em"], ["grid-template-columns", "auto auto"]]);

        const characterSelect = document.createElement("select");
        for (const option of dataManager.availableCharacterOptions) {
            if (option.text !== dataManager.userSettings.latestCharacterName) {
                characterSelect.options.add(option);
            }
        }

        if (characterSelect.options[0] !== undefined) {
            characterSelectionContainer.style.setProperty("display", "grid");
            
            characterSelect.style.setProperty("grid-column", "span 2");
            characterSelectionContainer.appendChild(characterSelect);
            characterSelect.value = characterSelect.options[0].value;

            displayManager.createButton(characterSelectionContainer, dataManager.content.ui.characterChoice.change, () => {
                dataManager.loadOrResetCharacter(characterSelect.value);
                displayManager.hideOverlay(currentOverlay);
            });            

            displayManager.createButton(characterSelectionContainer, dataManager.content.ui.characterChoice.delete, () => {
                // ADD CONFIRMATION QUESTION
                dataManager.deleteCharacter(characterSelect.value);
                displayManager.hideOverlay(currentOverlay);
            });
        }

        currentOverlay.viewer.appendChild(fragment);
    }

    createCharacter(originButton) {
        
        const currentOverlay = displayManager.openViewer(displayManager.overlays.styles.create, originButton);

        const fragment = document.createDocumentFragment();

        const questionPage = displayManager.createFlexColumnContainer(fragment, "div", [["flex-grow", 1], ["overflow", "auto"]]);

        const questionBar = displayManager.createFlexContainer(fragment, "p", [["justify-content", "space-between"]]);
        const questionBarArray = [];
        for (let i = 1; i <= 21; i++) {
            const radioButton = document.createElement("input");
            radioButton.classList.add("questionButton", "disabled");
            radioButton.type = "radio";
            radioButton.name = "questionBar";
            radioButton.disabled = true;
            radioButton.onclick = () => askQuestion(i);
            questionBar.appendChild(radioButton);
            questionBarArray.push(radioButton);
        }

        const questionResults = {};
        let questionNumber = 1;
        let highestQuestionNumber = 1;
        
        const buttonContainer = displayManager.createFlexContainer(fragment, "div", [["justify-content", "space-evenly"]]);

        const previousQuestionButton = displayManager.createButton(buttonContainer, "", () => {
            if (questionNumber === 1) {                
                displayManager.hideOverlay(currentOverlay);
            }
            else {
                askQuestion(questionNumber - 1);
                if (nextQuestionButton.disabled) {
                    changeNextQuestionButtonState(true);
                }
            }     
        });

        const nextQuestionButton = displayManager.createButton(buttonContainer, "", () => askQuestion(questionNumber + 1));

        askQuestion(questionNumber);

        function createTextArea(minHeightString) {
    
            const textInput = displayManager.createContainer(questionPage, "textarea", ["textInput", ["min-height", minHeightString]]);

            if (questionResults[`Q${questionNumber}`] === undefined) {
                questionResults[`Q${questionNumber}`] = {text: ""};
            }

            if(questionResults[`Q${questionNumber}`].text !== "") {
                textInput.value = questionResults[`Q${questionNumber}`].text;
            }
            else {
                changeNextQuestionButtonState(false);
            }

            textInput.onchange = () => {
                if (textInput.value.length > 0) {
                    questionResults[`Q${questionNumber}`].text = textInput.value;
                    textInput.style.height = (5 + textInput.scrollHeight)+"px";
                    changeNextQuestionButtonState(true);
                }
                else {
                    changeNextQuestionButtonState(false);
                }
            }

            return textInput;
        }

        function changeNextQuestionButtonState(enable) {

            nextQuestionButton.disabled = !enable;
            if (enable) {
                nextQuestionButton.classList.remove("disabled");
            }
            else {
                nextQuestionButton.classList.add("disabled");
            }
            
            for (let i = questionNumber + 1; i <= highestQuestionNumber; i++) {                
                questionBarArray[i - 1].disabled = !enable;
                if (enable) {                    
                    questionBarArray[i - 1].classList.remove("disabled");
                }
                else {
                    questionBarArray[i - 1].classList.add("disabled");
                }
            }
        }

        const creationObject = {};
        function askQuestion(newNumber) {

            questionPage.scrollTop = 0;

            questionNumber = newNumber;
            if (newNumber > highestQuestionNumber) {
                highestQuestionNumber = newNumber;
            }

            for (let i = 0; i <= Object.keys(questionResults).length; i++) {                
                if (i === questionNumber - 1) {
                    questionBarArray[i].disabled = false;
                    questionBarArray[i].classList.remove("disabled");
                    questionBarArray[i].checked = true;
                }
                else {
                    questionBarArray[i].checked = false;
                }
            }

            questionPage.innerHTML = "";

            let questionText;
            if (questionNumber < 21) {
                questionText = questionNumber + ". " + dataManager.content.ui.characterCreation[`Q${questionNumber}`].question;
            }
            else {
                questionText = dataManager.content.ui.characterCreation.summary.title;
            }            
            displayManager.createTextElement(questionPage, "p", questionText, ["title", "bold", ["text-align", "center"]]);

            function checkQ7skill() {
                if (questionResults.Q7 !== undefined && questionResults.Q7.gainRef !== "stat" && !getQ7availableSkillRefs().includes(questionResults.Q7.gainRef)) {
                    questionResults.Q7.gainRef = "stat";
                }
            }
            function getQ7availableSkillRefs() {
                const knownSkillRefs = new Set([
                    dataManager.content.clans[questionResults.Q1.clanRef].skillRef,
                    ...dataManager.content.families[questionResults.Q2.familyRef].skillRefs,
                    ...questionResults.Q3.skillRefs
                ]);
                const availableSkillRefs = [];
                for (const skillRef of Object.keys(dataManager.content.skills)) {
                    if (!knownSkillRefs.has(skillRef)) {
                        availableSkillRefs.push(skillRef);
                    }
                }
                return availableSkillRefs;
            }

            function checkQ18rings() {
                if (questionResults.Q18 !== undefined) {
                    let ringsChanged = [];
                    for (let i = 0; i < 2; i++) {
                        if (questionResults.Q18.values[i].effectRef === "change rings") {
                            ringsChanged.push(i);
                        }
                    }
                    if (ringsChanged.length > 0) {
                        const ringValues = getQ18ringValues();

                        for (const i of ringsChanged) {
                            const ringRefs = questionResults.Q18.values[i].extraRef.split("⇨");
                            const decreasedRingRef = ringRefs[0];
                            const increasedRingRef = ringRefs[1];

                            if (ringValues[decreasedRingRef] < 2) {
                                questionResults.Q18.values[i].extraRef = null;
                            }
                            if (ringValues[increasedRingRef] > 2) {
                                questionResults.Q18.values[i].extraRef = null;
                            }
                        }
                    }
                }
            }
            function getQ18ringValues() {
                const ringValues = {
                    earth:1,
                    water:1,
                    fire:1,
                    air:1,
                    void:1
                }
                ringValues[dataManager.content.clans[questionResults.Q1.clanRef].ringRef] += 1;
                ringValues[questionResults.Q2.ringRef] += 1;
                for (const ringRef of questionResults.Q3.ringRefs) {
                    ringValues[ringRef] += 1;
                }
                ringValues[questionResults.Q4] += 1;
                return ringValues;
            }
            
            switch(questionNumber) {
                case 1:{                    

                    const clanSelect = displayManager.createSelect(questionPage, Object.keys(dataManager.content.clans), dataManager.content.clans, "name");
                    const clanInfo = displayManager.createContainer(questionPage, "div");

                    if(questionResults.Q1 !== undefined) {
                        clanSelect.value = questionResults.Q1.clanRef;
                    }
                    selectClan();

                    function selectClan() {
                        questionResults.Q1 = {clanRef: clanSelect.value};
                        const clan = dataManager.content.clans[clanSelect.value];

                        clanInfo.innerHTML = "";

                        const increaseContainer = displayManager.createGridContainer(clanInfo, "p", [["grid-auto-rows", "1.5em"]]);

                        const ringDiv = displayManager.createFlexLineContainer(increaseContainer);
                        displayManager.createTextElement(ringDiv, "span", dataManager.content.ui.ring + dataManager.content.ui.colon, ["bold"]);
                        displayManager.createConsultIcon(ringDiv, clan.ringRef, "rings");
                        displayManager.createTextElement(ringDiv, "span", dataManager.content.rings[clan.ringRef].name);

                        const skillDiv = displayManager.createFlexLineContainer(increaseContainer);
                        displayManager.createTextElement(skillDiv, "span", dataManager.content.ui.skill + dataManager.content.ui.colon, ["bold"]);
                        displayManager.createConsultIcon(skillDiv, clan.skillRef, "skills");
                        displayManager.createTextElement(skillDiv, "span", dataManager.content.skills[clan.skillRef].name);                        

                        const statusDiv = displayManager.createFlexLineContainer(increaseContainer);
                        displayManager.createTextElement(statusDiv, "span", dataManager.content.ui.status + dataManager.content.ui.colon, ["bold"]);
                        displayManager.createTextElement(statusDiv, "span", clan.status);

                        const textDiv = displayManager.createFlexColumnContainer(clanInfo);
                        const propertyArray = ["description", "bushidō", "culture", "knowledge"];
                        for (let i = 0; i < propertyArray.length; i++) {
                            let container;
                            if (i === 0) {
                                container = displayManager.createContainer(textDiv);
                            }
                            else {
                                container = displayManager.createContainer(textDiv, "p");
                                displayManager.createTextElement(container, "span", dataManager.content.ui.characterCreation.Q1.extraParts[i - 1], ["bold"]);
                            }
                            for (const string of clan[propertyArray[i]]) {
                                displayManager.createTextElement(container, "p", string);
                            }
                        }
                    }
                    clanSelect.onchange = () => {                        
                        questionResults.Q2 = undefined;
                        selectClan();
                        checkQ7skill();
                        checkQ18rings();
                    };
                    
                    break;
                }

                case 2:{

                    const clanFamilyRefs = [];
                    const otherFamilyRefs = [];
                    for (const familyRef of Object.keys(dataManager.content.families)) {
                        if (dataManager.content.clans[questionResults.Q1.clanRef].familyRefs.includes(familyRef)) {
                            clanFamilyRefs.push(familyRef);
                        }
                        else {
                            otherFamilyRefs.push(familyRef);
                        }
                    }

                    let familySelect = document.createElement("select");
                    questionPage.appendChild(familySelect);
                    
                    const checkboxLine = displayManager.createFlexLineContainer(questionPage);
                    const otherFamiliesCheckbox = displayManager.createCheckbox(checkboxLine);
                    displayManager.createTextElement(checkboxLine, "span", dataManager.content.ui.characterCreation.Q2.showOtherFamilies);

                    otherFamiliesCheckbox.onchange = () => {
                        questionResults.Q2 = {};
                        createFamilyList();
                        selectFamily();
                        checkQ7skill();
                        checkQ18rings();
                    }

                    function createFamilyList() {

                        let newArray;                        
                        if (otherFamiliesCheckbox.checked) {
                            newArray = otherFamilyRefs;
                        }
                        else {
                            newArray = clanFamilyRefs;
                        }                       
                        
                        for (let i = familySelect.options.length - 1; i >= 0; i--) {
                            familySelect.options[i] = null;
                        }
                        for (const familyRef of newArray) {
                            const option = document.createElement("option");
                            option.value = familyRef;
                            option.text = dataManager.content.families[familyRef].name;                        
                            familySelect.options.add(option);
                        }
                    }
                    createFamilyList();

                    const familyInfo = displayManager.createContainer(questionPage);

                    if(questionResults.Q2 !== undefined) {
                        if (otherFamilyRefs.includes(questionResults.Q2.familyRef)) {
                            otherFamiliesCheckbox.checked = true;
                            createFamilyList();
                        }
                        familySelect.value = questionResults.Q2.familyRef;
                    }
                    else {
                        questionResults.Q2 = {};
                    }
                    selectFamily();

                    function selectFamily() {

                        questionResults.Q2.familyRef = familySelect.value;
                        const family = dataManager.content.families[familySelect.value];

                        familyInfo.innerHTML = "";

                        const increaseContainer = displayManager.createGridContainer(familyInfo, "p", [["grid-auto-rows", "1.5em"]]);

                        const ringDiv = displayManager.createFlexLineContainer(increaseContainer);
                        displayManager.createTextElement(ringDiv, "span", dataManager.content.ui.ring + dataManager.content.ui.colon, ["bold"]);
                        const ringSelect = document.createElement("select");
                        displayManager.createConsultIcon(ringDiv, ringSelect.value, "rings");
                        
                        for (const ringRef of family.ringChoiceRefs) {
                            const option = document.createElement("option");
                            option.value = ringRef;
                            option.text = dataManager.content.rings[ringRef].name;                        
                            ringSelect.options.add(option);
                        }
                        ringDiv.appendChild(ringSelect);

                        if(questionResults.Q2.ringRef !== undefined) {
                            ringSelect.value = questionResults.Q2.ringRef;
                        }
                        else {
                            selectRing();
                        }
                        ringSelect.onchange = () => {                            
                            selectRing();
                            checkQ18rings();
                        }
                        
                        function selectRing() {
                            questionResults.Q2.ringRef = ringSelect.value;
                        }                    

                        const gloryDiv = displayManager.createFlexLineContainer(increaseContainer);
                        displayManager.createTextElement(gloryDiv, "span", dataManager.content.ui.glory + dataManager.content.ui.colon, ["bold"]);
                        displayManager.createTextElement(gloryDiv, "span", family.glory);

                        const wealthDiv = displayManager.createFlexLineContainer(increaseContainer);
                        displayManager.createTextElement(wealthDiv, "span", dataManager.content.ui.wealth + dataManager.content.ui.colon, ["bold"]);
                        displayManager.createTextElement(wealthDiv, "span", family.koku + " " + dataManager.content.equipment.koku.name.toLowerCase());

                        const skillsDiv = displayManager.createFlexLineContainer(increaseContainer);
                        displayManager.createTextElement(skillsDiv, "span", dataManager.content.ui.skills + dataManager.content.ui.colon, ["bold"]);
                        for (let i = 0; i < family.skillRefs.length; i++) {
                            const skillDiv = displayManager.createFlexLineContainer(increaseContainer);
                            displayManager.createConsultIcon(skillDiv, family.skillRefs[i], "skills");
                            displayManager.createTextElement(skillDiv, "span", dataManager.content.skills[family.skillRefs[i]].name);
                            
                        }

                        for (const string of family.description) {
                            displayManager.createTextElement(familyInfo, "p", string);
                        }
                    }                    
                    familySelect.onchange = () => {
                        questionResults.Q2 = {};
                        selectFamily();
                        checkQ7skill();
                        checkQ18rings();
                    };
                     
                    break;
                }

                case 3:{

                    const clanSchoolRefs = [];
                    const otherSchoolRefs = [];
                    // The following relies on the fact that schoolRefs and familyRefs are the same
                    for (const schoolRef of Object.keys(dataManager.content.schools)) {
                        if (dataManager.content.clans[questionResults.Q1.clanRef].familyRefs.includes(schoolRef)) {
                            clanSchoolRefs.push(schoolRef);
                        }
                        else {
                            otherSchoolRefs.push(schoolRef);
                        }
                    }

                    const schoolSelect = document.createElement("select");
                    questionPage.appendChild(schoolSelect);
                    
                    const checkboxLine = displayManager.createFlexLineContainer(questionPage);
                    const otherSchoolsCheckbox = displayManager.createCheckbox(checkboxLine, () => {
                        createNewQ3();
                        createSchoolList();
                        selectSchool();
                        checkQ7skill();
                        checkQ18rings();
                    });
                    displayManager.createTextElement(checkboxLine, "span", dataManager.content.ui.characterCreation.Q3.showOtherSchools);

                    function createNewQ3() {
                        questionResults.Q3 = {
                            ringRefs: new Set(),
                            skillRefs: new Set(),
                            techRefSets: [],
                            equipmentRefData: []
                        };
                    }
                    
                    function createSchoolList() {

                        let newArray;                        
                        if (otherSchoolsCheckbox.checked) {
                            newArray = otherSchoolRefs;
                        }
                        else {
                            newArray = clanSchoolRefs;
                        }                       
                        
                        for (let i = schoolSelect.options.length - 1; i >= 0; i--) {
                            schoolSelect.options[i] = null;
                        }
                        for (const schoolRef of newArray) {
                            const option = document.createElement("option");
                            option.value = schoolRef;
                            const school = dataManager.content.schools[schoolRef];
                            let schoolTypes = "";
                            for (let i = 0; i < school.types.length; i++) {
                                schoolTypes += school.types[i];
                                if (i < school.types.length - 1) {
                                    schoolTypes += ", ";
                                }
                            }
                            option.text = `${school.name} (${schoolTypes})`;                        
                            schoolSelect.options.add(option);
                        }
                    }

                    createSchoolList();

                    const schoolInfo = displayManager.createContainer(questionPage);

                    if(questionResults.Q3 !== undefined) {
                        if (otherSchoolRefs.includes(questionResults.Q3.schoolRef)) {
                            otherSchoolsCheckbox.checked = true;
                            createSchoolList();
                        }
                        schoolSelect.value = questionResults.Q3.schoolRef;
                    }
                    else {
                        createNewQ3();
                    }
                    selectSchool();

                    function selectSchool() {
                        questionResults.Q3.schoolRef = schoolSelect.value;
                        const school = dataManager.content.schools[schoolSelect.value];

                        schoolInfo.innerHTML = "";

                        for (const string of school.description) {
                            displayManager.createTextElement(schoolInfo, "p", string);
                        }

                        let selectedRingsNum = 2;
                        let selectedSkillsNum = 0;
                        let selectedTechsNum = 0;
                        let totalTechsNum = 0;

                        const ringContainer = displayManager.createGridContainer(schoolInfo, "p", [["grid-auto-rows", "1.5em"]]);
                        const ringsBold = displayManager.createTextElement(ringContainer, "span", "", ["bold"]);

                        if (school.ringRefs === "Any two different rings") {

                            selectedRingsNum = 0;
                            
                            const ringCheckboxes = [];
                            for (const ringRef of dataManager.individualRingRefs) {

                                const ringLine = displayManager.createFlexLineContainer(ringContainer);
                                const ringCheckbox = displayManager.createCheckbox(ringLine, () => {
                                    if (questionResults.Q3.ringRefs.has(ringRef)) {
                                        questionResults.Q3.ringRefs.delete(ringRef);
                                        for (const checkbox of ringCheckboxes) {
                                            checkbox.disabled = false;
                                            ringCheckbox.classList.remove("disabled");
                                        }
                                        selectedRingsNum--;
                                        updateRingsText();
                                    }
                                    else {
                                        questionResults.Q3.ringRefs.add(ringRef);
                                        if (questionResults.Q3.ringRefs.size >= 2) {
                                            for (const checkbox of ringCheckboxes) {
                                                if (!checkbox.checked) {
                                                    checkbox.disabled = true;
                                                    checkbox.classList.add("disabled");
                                                }
                                            }
                                        }
                                        selectedRingsNum++;
                                        updateRingsText();
                                    }
                                    checkQ18rings();
                                });
                                ringCheckboxes.push(ringCheckbox);

                                if (questionResults.Q3.ringRefs.has(ringRef)) {
                                    ringCheckbox.checked = true;
                                    selectedRingsNum++;
                                }
                                else if (questionResults.Q3.ringRefs.size >= 2) {
                                    ringCheckbox.disabled = true;
                                    ringCheckbox.classList.add("disabled");
                                }

                                displayManager.createConsultIcon(ringLine, ringRef, "rings");
                                displayManager.createTextElement(ringLine, "span", dataManager.content.rings[ringRef].name);
                            }
                            updateRingsText();

                            function updateRingsText() {
                                ringsBold.textContent = `${dataManager.content.ui.rings} (${selectedRingsNum}/2)${dataManager.content.ui.colon}`;
                                if (selectedRingsNum < 2) {
                                    changeNextQuestionButtonState(false);
                                }
                                else {
                                    checkCompletion();
                                }
                            }
                        }
                        else {
                            ringsBold.textContent = dataManager.content.ui.rings + dataManager.content.ui.colon;
                            for (let i = 0; i < school.ringRefs.length; i++) {
                                questionResults.Q3.ringRefs.add(school.ringRefs[i]);
                                const ringLine = displayManager.createFlexLineContainer(ringContainer);
                                displayManager.createConsultIcon(ringLine, school.ringRefs[i], "rings");
                                displayManager.createTextElement(ringLine, "span", dataManager.content.rings[school.ringRefs[i]].name);
                            }
                        }                        

                        const skillsContainer = displayManager.createGridContainer(schoolInfo, "p", [["grid-auto-rows", "1.5em"]]);
                        const skillsBold = displayManager.createTextElement(skillsContainer, "span", "", ["bold"]);
                        
                        const skillCheckboxes = [];                        
                        for (const skillRef of school.startingSkillRefs[0]) {

                            const skillLine = displayManager.createFlexLineContainer(skillsContainer);
                            const skillCheckbox = displayManager.createCheckbox(skillLine, () => {
                                if (questionResults.Q3.skillRefs.has(skillRef)) {
                                    questionResults.Q3.skillRefs.delete(skillRef);
                                    for (const checkbox of skillCheckboxes) {
                                        checkbox.disabled = false;
                                        checkbox.classList.remove("disabled");
                                    }
                                    selectedSkillsNum--;
                                }
                                else {
                                    questionResults.Q3.skillRefs.add(skillRef);
                                    if (questionResults.Q3.skillRefs.size >= school.startingSkillRefs[1]) {
                                        for (const checkbox of skillCheckboxes) {
                                            if (!checkbox.checked) {
                                                checkbox.disabled = true;
                                                checkbox.classList.add("disabled");
                                            }
                                        }
                                    }
                                    selectedSkillsNum++;
                                }
                                updateSkillsText();                            
                                checkQ7skill();
                            });
                            skillCheckboxes.push(skillCheckbox);
                            displayManager.createConsultIcon(skillLine, skillRef, "skills");
                            displayManager.createTextElement(skillLine, "span", dataManager.content.skills[skillRef].name);

                            if (questionResults.Q3.skillRefs.has(skillRef)) {
                                skillCheckbox.checked = true;
                                selectedSkillsNum++;
                            }
                            else if (questionResults.Q3.skillRefs.size >= school.startingSkillRefs[1]) {
                                skillCheckbox.disabled = true;
                                skillCheckbox.classList.add("disabled");
                            }
                        }
                        updateSkillsText();

                        function updateSkillsText() {
                            skillsBold.textContent = `${dataManager.content.ui.skills} (${selectedSkillsNum}/${school.startingSkillRefs[1]})${dataManager.content.ui.colon}`;
                            if (selectedSkillsNum < school.startingSkillRefs[1]) {
                                changeNextQuestionButtonState(false);
                            }
                            else {
                                checkCompletion();
                            }
                        }

                        const honorLine = displayManager.createFlexLineContainer(schoolInfo, "p");
                        displayManager.createTextElement(honorLine, "span", dataManager.content.ui.honor + dataManager.content.ui.colon, ["bold"]);
                        displayManager.createTextElement(honorLine, "span", school.honor);

                        const techGroupsContainer = displayManager.createGridContainer(schoolInfo, "p", [["grid-auto-rows", "1.5em"]]);
                        displayManager.createTextElement(techGroupsContainer, "span", dataManager.content.ui.characterCreation.Q3.techniquesAvailable + dataManager.content.ui.colon, ["bold"]);
                        const techGroups = displayManager.createTextElement(techGroupsContainer, "span");
                        for (let i = 0; i < school.techniqueGroupRefs.length; i++) {
                            for (const object of dataManager.content.ui.techGroupFilter) {
                                if (object.value === school.techniqueGroupRefs[i]) {
                                    techGroups.textContent += object.text;
                                    if (i < school.techniqueGroupRefs.length - 1) {
                                        techGroups.textContent += ", ";
                                    }
                                    break;
                                }
                            }                            
                        }

                        const techContainer = displayManager.createGridContainer(schoolInfo, "p", [["grid-auto-rows", "1.5em"]]);
                        const techsBold = displayManager.createTextElement(techContainer, "span", "", ["bold"]);
                        
                        for (let i = 0; i < school.startingTechniqueRefs.length; i++) {

                            const techRefData = school.startingTechniqueRefs[i];
                            questionResults.Q3.techRefSets.push(new Set());

                            if (typeof techRefData === "string") {
                                questionResults.Q3.techRefSets[i].add(techRefData);
                                const techLine = displayManager.createFlexLineContainer(techContainer);
                                const techCheckbox = displayManager.createCheckbox(techLine);
                                techCheckbox.checked = true;
                                techCheckbox.disabled = true;
                                techCheckbox.classList.add("disabled");
                                displayManager.createConsultIcon(techLine, techRefData, "techniques");
                                displayManager.createTextElement(techLine, "span", dataManager.content.techniques[techRefData].name);
                                selectedTechsNum++;
                                totalTechsNum++;
                            }
                            else {
                                const techCheckboxes = [];
                                for (const techRef of techRefData[0]) {

                                    const techLine = displayManager.createFlexLineContainer(techContainer);                                
                                    const techCheckbox = displayManager.createCheckbox(techLine, () => {
                                        if (questionResults.Q3.techRefSets[i].has(techRef)) {
                                            questionResults.Q3.techRefSets[i].delete(techRef);
                                            for (const checkbox of techCheckboxes) {
                                                checkbox.disabled = false;
                                                checkbox.classList.remove("disabled");
                                            }
                                            selectedTechsNum--;
                                        }
                                        else {
                                            questionResults.Q3.techRefSets[i].add(techRef);
                                            if (questionResults.Q3.techRefSets[i].size >= techRefData[1]) {
                                                for (const checkbox of techCheckboxes) {
                                                    if (!checkbox.checked) {
                                                        checkbox.disabled = true;
                                                        checkbox.classList.add("disabled");
                                                    }
                                                }
                                            }
                                            selectedTechsNum++;
                                        }
                                        updateTechsText();
                                    });
                                    techCheckboxes.push(techCheckbox);
                                    displayManager.createConsultIcon(techLine, techRef, "techniques");
                                    displayManager.createTextElement(techLine, "span", dataManager.content.techniques[techRef].name);

                                    if (questionResults.Q3.techRefSets[i].has(techRef)) {
                                        techCheckbox.checked = true;
                                        selectedTechsNum++;
                                    }
                                    else if (questionResults.Q3.techRefSets[i].size >= techRefData[1]) {
                                        techCheckbox.disabled = true;
                                        techCheckbox.classList.add("disabled");
                                    }
                                }
                                totalTechsNum += techRefData[1];
                            }
                        }
                        updateTechsText();

                        function updateTechsText() {
                            techsBold.textContent = `${dataManager.content.ui.techniques} (${selectedTechsNum}/${totalTechsNum})${dataManager.content.ui.colon}`;
                            if (selectedTechsNum < totalTechsNum) {
                                changeNextQuestionButtonState(false);
                            }
                            else {
                                checkCompletion();
                            }
                        }
                        
                        const schoolAbilityContainer = displayManager.createGridContainer(schoolInfo, "p", [["grid-auto-rows", "1.5em"]]);                        
                        displayManager.createTextElement(schoolAbilityContainer, "span", dataManager.content.ui.techniqueGroupNames.schoolAbility + dataManager.content.ui.colon, ["bold"]);
                        const schoolAbilityLine = displayManager.createFlexLineContainer(schoolAbilityContainer);
                        displayManager.createConsultIcon(schoolAbilityLine, school.initialAbility, "techniques");
                        displayManager.createTextElement(schoolAbilityLine, "span", school.initialAbility.name);

                        const equipmentContainer = displayManager.createGridContainer(schoolInfo, "p", [["grid-auto-rows", "1.5em"]]);
                        displayManager.createTextElement(equipmentContainer, "span", dataManager.content.ui.equipment + dataManager.content.ui.colon, ["bold"]);
                        getEquipment(equipmentContainer, school.startingEquipmentRefData, questionResults.Q3.equipmentRefData, 0);                        

                        function getEquipment(container, equipmentRefDataArray, savedArray, startingIndex) {                            
                            let equipmentIndex = startingIndex;
                            for (const equipmentRefData of equipmentRefDataArray) {
                                if (typeof equipmentRefData === "string") {
                                    if (Object.keys(dataManager.content.equipment).includes(equipmentRefData)) {
                                        const equipmentLine = displayManager.createFlexLineContainer(container);
                                        displayManager.createConsultIcon(equipmentLine, equipmentRefData, "equipment");
                                        displayManager.createTextElement(equipmentLine, "span", dataManager.content.equipment[equipmentRefData].name);
                                        savedArray[equipmentIndex] = equipmentRefData;
                                        equipmentIndex++;
                                    }
                                    else if (equipmentRefData === "traveling pack") {
                                        const packContents = [
                                            "blanket",
                                            "bowl",
                                            "chopsticks",
                                            ["traveling ration", 4],
                                            "flint and tinder",
                                            "any item of rarity 4 or lower",
                                            "any item of rarity 4 or lower",
                                            "any item of rarity 4 or lower"
                                        ];
                                        getEquipment(container, packContents, savedArray, equipmentIndex);
                                        equipmentIndex += packContents.length;
                                    }
                                    else {
                                        const equipmentLine = displayManager.createFlexLineContainer(container);                                        
                                        const select = document.createElement("select");                                        

                                        if (equipmentRefData === "any item of rarity 4 or lower") {                                        
                                            for (const equipRef of Object.keys(dataManager.content.equipment)) {
                                                const equipObject = dataManager.content.equipment[equipRef];
                                                if (equipObject.groupRef === "item" && equipObject.rarity !== undefined && (equipObject.rarity <= 4 || equipObject.rarity[0] <= 4)) {
                                                    const option = document.createElement("option");
                                                    option.value = equipRef;
                                                    option.text = equipObject.name;
                                                    select.options.add(option);
                                                }
                                            }
                                        }
                                        else if (equipmentRefData === "any one weapon of rarity 6 or lower") {
                                            for (const equipRef of Object.keys(dataManager.content.equipment)) {
                                                const equipObject = dataManager.content.equipment[equipRef];
                                                if (equipObject.groupRef === "weapon" && equipObject.rarity !== undefined && (equipObject.rarity <= 6)) {
                                                    const option = document.createElement("option");
                                                    option.value = equipRef;
                                                    option.text = equipObject.name;
                                                    select.options.add(option);
                                                }                                            
                                            }                                            
                                        }
                                        
                                        const selectIndex = equipmentIndex;
                                        equipmentIndex++;

                                        if (savedArray[selectIndex] !== undefined) {                                            
                                            select.value = savedArray[selectIndex];
                                            
                                        }
                                        else {
                                            savedArray[selectIndex] = select.value;                                            
                                        }
                                        
                                        const consultIcon = displayManager.createConsultIcon(equipmentLine, select.value, "equipment");
                                        equipmentLine.appendChild(select);

                                        select.onchange = () => {
                                            savedArray[selectIndex] = select.value;
                                            consultIcon.onclick = () => displayManager.consultContent(consultIcon, select.value, "equipment", null, true);
                                        }
                                    }                                    
                                }
                                else if (typeof equipmentRefData[0] === "string") {
                                    const equipmentLine = displayManager.createFlexLineContainer(container);
                                    displayManager.createConsultIcon(equipmentLine, equipmentRefData[0], "equipment");
                                    displayManager.createTextElement(equipmentLine, "span", dataManager.content.equipment[equipmentRefData[0]].name + " x" + equipmentRefData[1]);
                                    savedArray[equipmentIndex] = equipmentRefData;
                                    equipmentIndex++;
                                }
                                else if (equipmentRefData[1] === "and") {
                                    getEquipment(container, equipmentRefData[0], savedArray, equipmentIndex);
                                }
                                else {
                                    const choiceArray = equipmentRefData[0];

                                    const radioIndex = equipmentIndex;
                                    equipmentIndex++;

                                    if (savedArray[radioIndex] === undefined) {
                                        savedArray[radioIndex] = {chosenIndex: 0, displayed: []};
                                    }

                                    for (let i = 0; i < choiceArray.length; i++) {
                                        
                                        const equipmentLine = displayManager.createFlexLineContainer(container);

                                        const radioButton = document.createElement("input");
                                        radioButton.type = "radio";
                                        radioButton.name = radioIndex;
                                        equipmentLine.appendChild(radioButton);
                                        radioButton.onclick = () => {
                                            savedArray[radioIndex].chosenIndex = i;
                                            radioButton.checked = true;
                                        }
                                        
                                        if (savedArray[radioIndex].chosenIndex === i) {
                                            radioButton.checked = true;
                                        }
                                        if (savedArray[radioIndex].displayed[i] === undefined) {
                                            savedArray[radioIndex].displayed[i] = [];
                                        }
                                        if (typeof choiceArray[i] !== "string" && typeof choiceArray[i][0] !== "string") {
                                            equipmentLine.style.setProperty("grid-row", `span ${choiceArray[i][0].length}`);
                                        }
                                        getEquipment(displayManager.createGridContainer(equipmentLine, "div", [["grid-auto-rows", "1.5em"]]), [choiceArray[i]], savedArray[radioIndex].displayed[i], 0);
                                    }
                                }
                            }
                        }

                        function checkCompletion() {
                            if (selectedRingsNum === 2&& selectedSkillsNum === school.startingSkillRefs[1] && selectedTechsNum === totalTechsNum) {
                                changeNextQuestionButtonState(true);
                            }                            
                        }
                    }                    
                    schoolSelect.onchange = () => {
                        createNewQ3();
                        checkQ7skill();
                        checkQ18rings();
                        selectSchool();
                    }

                    break;
                }

                case 4:{

                    const ringOptions = dataManager.content.ui.characterCreation.Q4.ringOptions;

                    const ringSelect = displayManager.createSelect(questionPage, Object.keys(ringOptions), ringOptions, "optionText");                    

                    const ringLine = displayManager.createFlexLineContainer(questionPage, "p");
                    displayManager.createTextElement(ringLine, "span", dataManager.content.ui.ring + dataManager.content.ui.colon, ["bold"]);
                    const consultIcon = displayManager.createConsultIcon(ringLine, ringSelect.value, "rings");
                    const ringText = displayManager.createTextElement(ringLine, "span", dataManager.content.rings[ringSelect.value].name);

                    const description = displayManager.createTextElement(questionPage);

                    if(questionResults.Q4 !== undefined) {
                        ringSelect.value = questionResults.Q4;
                    }
                    selectRing();
                    
                    ringSelect.onchange = () => {
                        selectRing();
                        checkQ18rings();
                    }

                    function selectRing() {
                        questionResults.Q4 = ringSelect.value;
                        consultIcon.onclick = () => displayManager.consultContent(consultIcon, ringSelect.value, "rings", null, true);
                        ringText.textContent = dataManager.content.rings[ringSelect.value].name;
                        description.textContent = ringOptions[ringSelect.value].description;
                    }
                    
                    break;
                }

                case 5:                    
                case 6:
                case 14:
                case 15:                
                case 20:{

                    createTextArea("10em");
                    break;
                }

                case 7:
                case 8:{                    

                    createTextArea("10em");

                    displayManager.createTextElement(questionPage, "p", dataManager.content.ui.characterCreation[`Q${questionNumber}`].instruction);
                    
                    let availableSkillRefs;
                    if (questionNumber === 7) {
                        availableSkillRefs = getQ7availableSkillRefs();
                    }
                    else if (questionNumber === 8) {
                        availableSkillRefs = ["commerce", "labor", "medicine", "seafaring", "skulduggery", "survival"];
                    }                    

                    const radioContainer = displayManager.createFlexColumnContainer(questionPage);

                    const skillSelect = displayManager.createSelect(undefined, availableSkillRefs, dataManager.content.skills, "name");
                    let consultIcon;

                    const radioButtons = [];
                    for (let i = 0; i < 2; i++) {
                        const beliefLine = displayManager.createFlexLineContainer(radioContainer, "p");

                        radioButtons[i] = document.createElement("input");
                        radioButtons[i].type = "radio";
                        radioButtons[i].name = "belief";
                        if (i === 0) {
                            radioButtons[i].value = "for";
                        }
                        else {
                            radioButtons[i].value = "against";
                        }                        
                        beliefLine.appendChild(radioButtons[i]);                        

                        const beliefContainer = displayManager.createFlexColumnContainer(beliefLine);
                        displayManager.createTextElement(beliefContainer, "span", dataManager.content.ui.characterCreation[`Q${questionNumber}`].options[i]);
                        if (i === 1) {
                            const skillLine = displayManager.createFlexLineContainer(beliefContainer);
                            consultIcon = displayManager.createConsultIcon(skillLine, skillSelect.value, "skills");
                            skillLine.appendChild(skillSelect);                            
                        }                        
                    }
                    
                    radioButtons[0].onclick = () => {
                        questionResults[`Q${questionNumber}`].gainRef = "stat";
                    }
                    radioButtons[1].onclick = () => {
                        questionResults[`Q${questionNumber}`].gainRef = skillSelect.value;
                    }
                    skillSelect.onchange = () => {
                        consultIcon.onclick = () => displayManager.consultContent(consultIcon, skillSelect.value, "skills", null, true);
                        if (radioButtons[1].checked) {
                            questionResults[`Q${questionNumber}`].gainRef = skillSelect.value;
                        }
                    }

                    if (questionResults[`Q${questionNumber}`].gainRef === undefined) {
                        radioButtons[0].checked = true;
                        questionResults[`Q${questionNumber}`].gainRef = "stat";
                    }
                    else {
                        if (questionResults[`Q${questionNumber}`].gainRef === "stat") {
                            radioButtons[0].checked = true;
                        }
                        else {
                            radioButtons[1].checked = true;

                            if (availableSkillRefs.includes(questionResults[`Q${questionNumber}`].gainRef)) {
                                skillSelect.value = questionResults[`Q${questionNumber}`].gainRef;
                            }
                            else {
                                questionResults[`Q${questionNumber}`].gainRef = skillSelect.value;
                            }
                        }
                    }                 
                    
                    break;
                }

                case 9:
                case 10:
                case 11:
                case 12:{

                    const traitGroupRefs = ["distinction", "adversity", "passion", "anxiety"];
                    const traitGroupRef = traitGroupRefs[questionNumber - 9];
                    const traitRefs = [];
                    for (const traitRef of Object.keys(dataManager.content.traits)) {
                        if (dataManager.content.traits[traitRef].groupRef === traitGroupRef) {
                            traitRefs.push(traitRef);
                        }
                    }
                    traitRefs.push("custom");

                    createTextArea("10em");
                    displayManager.createTextElement(questionPage, "p", dataManager.content.ui.characterCreation[`Q${questionNumber}`].instruction);
                    const selectLine = displayManager.createFlexLineContainer(questionPage);
                    const customTraitContainer = displayManager.createContainer(undefined, "p", [["display", "none"], ["flex-direction", "column"], ["gap", "0.5em"]]);

                    const traitSelect = document.createElement("select");                    
                    for (const traitRef of traitRefs) {
                        const option = document.createElement("option");
                        option.value = traitRef;
                        if (traitRef !== "custom") {
                            option.text = dataManager.content.traits[traitRef].name;
                        }
                        else {
                            option.text = dataManager.content.ui.characterCreation.Q13.custom[questionNumber - 9];
                        }                                
                        traitSelect.options.add(option);
                    }
                    
                    if (questionResults[`Q${questionNumber}`].traitData === undefined) {
                        questionResults[`Q${questionNumber}`].traitData = {ref: traitSelect.value};
                    }
                    else {
                        if (Object.keys(questionResults[`Q${questionNumber}`].traitData).includes("ref")) {
                            traitSelect.value = questionResults[`Q${questionNumber}`].traitData.ref;
                        }
                        else {
                            traitSelect.value = "custom";                            
                            showCustomTrait(customTraitContainer, questionResults[`Q${questionNumber}`].traitData);
                        }
                    }

                    const consultIcon =  displayManager.createTextElement(selectLine, "span", String.fromCharCode(dataManager.content.ui.customIcons.consultIcon), ["alignCenter", "largeFontSize", "pointer"]);
                    if (traitSelect.value !== "custom") {
                        consultIcon.onclick = () => displayManager.consultContent(consultIcon, traitSelect.value, "traits", null, true);
                        consultIcon.style.setProperty("visibility", "visible");
                    }
                    selectLine.appendChild(traitSelect);
                    questionPage.appendChild(customTraitContainer);
                    
                    traitSelect.onchange = () => {
                        if (traitSelect.value !== "custom") {
                            customTraitContainer.style.setProperty("display", "none");
                            questionResults[`Q${questionNumber}`].traitData = {ref: traitSelect.value};
                            consultIcon.onclick = () => displayManager.consultContent(consultIcon, traitSelect.value, "traits", null, true);
                            consultIcon.style.setProperty("visibility", "visible");
                        }
                        else {
                            questionResults[`Q${questionNumber}`].traitData = {name: "", effects: [], groupRef: traitGroupRef, typeRefs: []};
                            showCustomTrait(customTraitContainer, questionResults[`Q${questionNumber}`].traitData);
                            consultIcon.onclick = null;
                            consultIcon.style.setProperty("visibility", "hidden");
                        }
                    }
                    
                    break;
                }

                case 13:{

                    createTextArea("10em");

                    displayManager.createTextElement(questionPage, "p", dataManager.content.ui.characterCreation.Q13.instruction);
                    
                    let advantageRefs = [];
                    const advantageGroupRefs = ["distinction", "passion"];
                    for (const traitRef of Object.keys(dataManager.content.traits)) {
                        if (advantageGroupRefs.includes(dataManager.content.traits[traitRef].groupRef)) {
                            advantageRefs.push(traitRef);
                        }
                    }
                    advantageRefs.push("distinction");
                    advantageRefs.push("passion");

                    const advantageSelect = document.createElement("select");
                    for (const advantageRef of advantageRefs) {
                        const option = document.createElement("option");
                        option.value = advantageRef;
                        if (advantageRef === "distinction") {
                            option.text = dataManager.content.ui.characterCreation.Q13.custom[0];
                        }
                        else if (advantageRef === "passion") {
                            option.text = dataManager.content.ui.characterCreation.Q13.custom[2];
                        }
                        else {
                            option.text = `${dataManager.content.traits[advantageRef].name}`; // (${dataManager.content.ui.traitGroupNames[dataManager.content.traits[advantageRef].groupRef]})
                        }
                        advantageSelect.options.add(option);
                    }
                    const advantageConsultIcon = displayManager.createTextElement(undefined, "span", String.fromCharCode(dataManager.content.ui.customIcons.consultIcon), ["alignCenter", "largeFontSize", "pointer"]);
                    const customAdvantageContainer = displayManager.createContainer(undefined, "div", [["display", "none"], ["flex-direction", "column"], ["gap", "0.5em"]]);
                    
                    let disadvantageRefs = [];
                    const disadvantageGroupRefs = ["adversity", "anxiety"];
                    for (const traitRef of Object.keys(dataManager.content.traits)) {
                        if (disadvantageGroupRefs.includes(dataManager.content.traits[traitRef].groupRef)) {
                            disadvantageRefs.push(traitRef);
                        }
                    }
                    disadvantageRefs.push("adversity");
                    disadvantageRefs.push("anxiety");

                    const disadvantageSelect = document.createElement("select");
                    for (const disadvantageRef of disadvantageRefs) {
                        const option = document.createElement("option");
                        option.value = disadvantageRef;
                        if (disadvantageRef === "adversity") {
                            option.text = dataManager.content.ui.characterCreation.Q13.custom[1];
                        }
                        else if (disadvantageRef === "anxiety") {
                            option.text = dataManager.content.ui.characterCreation.Q13.custom[3];
                        }
                        else {
                            option.text = `${dataManager.content.traits[disadvantageRef].name}`; // (${dataManager.content.ui.traitGroupNames[dataManager.content.traits[disadvantageRef].groupRef]})
                        }
                        disadvantageSelect.options.add(option);
                    }
                    const disadvantageConsultIcon = displayManager.createTextElement(undefined, "span", String.fromCharCode(dataManager.content.ui.customIcons.consultIcon), ["alignCenter", "largeFontSize", "pointer"]);
                    const customDisadvantageContainer = displayManager.createContainer(undefined, "div", [["display", "none"], ["flex-direction", "column"], ["gap", "0.5em"]]);

                    const skillSelect = displayManager.createSelect(undefined, Object.keys(dataManager.content.skills), dataManager.content.skills, "name");
                    const skillConsultIcon = displayManager.createConsultIcon(undefined, skillSelect.value, "skills");

                    const radioContainer = displayManager.createFlexColumnContainer(questionPage);
                    const radioButtons = {};
                    for (const propertyName of ["advantage", "disadvantage"]) {
                        const mentorLine = displayManager.createFlexLineContainer(radioContainer, "p");

                        radioButtons[propertyName] = document.createElement("input");
                        radioButtons[propertyName].type = "radio";
                        radioButtons[propertyName].name = "mentor";
                        mentorLine.appendChild(radioButtons[propertyName]);
                        radioButtons[propertyName].onclick = () => {
                            questionResults.Q13.propertyName = propertyName;
                        }
                        
                        const mentorContainer = displayManager.createFlexColumnContainer(mentorLine, "div", ["frame", ["flex-grow", 1], ["gap", "0.5em"]]);

                        displayManager.createTextElement(mentorContainer, "span", dataManager.content.ui.characterCreation.Q13.options[propertyName]);

                        if (propertyName === "advantage") {
                            const advantageSelectLine = displayManager.createFlexLineContainer(mentorContainer);
                            advantageSelectLine.appendChild(advantageConsultIcon);
                            advantageSelectLine.appendChild(advantageSelect);
                            mentorContainer.appendChild(customAdvantageContainer);                            
                        }
                        else {
                            const disadvantageSelectLine = displayManager.createFlexLineContainer(mentorContainer);
                            disadvantageSelectLine.appendChild(disadvantageConsultIcon);
                            disadvantageSelectLine.appendChild(disadvantageSelect);
                            mentorContainer.appendChild(customDisadvantageContainer);                            
                            const skillSelectLine = displayManager.createFlexLineContainer(mentorContainer);
                            skillSelectLine.appendChild(skillConsultIcon);
                            skillSelectLine.appendChild(skillSelect);
                        }                        
                    }            

                    if (questionResults.Q13.propertyName === undefined) {
                        radioButtons.advantage.checked = true;
                        questionResults.Q13.propertyName = "advantage";
                        questionResults.Q13.advantage = {ref: advantageSelect.value};
                        questionResults.Q13.disadvantage = {ref: disadvantageSelect.value};
                        questionResults.Q13.skillRef = skillSelect.value;
                    }
                    else {
                        if (questionResults.Q13.propertyName === "advantage") {
                            radioButtons.advantage.checked = true;
                                                        
                        }
                        else {
                            radioButtons.disadvantage.checked = true;
                            
                        }

                        if (Object.keys(questionResults.Q13.advantage).includes("ref")) {
                            advantageSelect.value = questionResults.Q13.advantage.ref;                                
                        }
                        else {
                            if (questionResults.Q13.advantage.groupRef === "distinction") {
                                advantageSelect.value = "distinction";
                            }
                            else {
                                advantageSelect.value = "passion";
                            }
                            showCustomTrait(customAdvantageContainer, questionResults.Q13.advantage);
                        }

                        if (Object.keys(questionResults.Q13.disadvantage).includes("ref")) {
                            disadvantageSelect.value = questionResults.Q13.disadvantage.ref;                                
                        }
                        else {
                            if (questionResults.Q13.disadvantage.groupRef === "adversity") {
                                disadvantageSelect.value = "adversity";
                            }
                            else {
                                disadvantageSelect.value = "anxiety";
                            }                                
                            showCustomTrait(customDisadvantageContainer, questionResults.Q13.disadvantage);
                        }                            
                        skillSelect.value = questionResults.Q13.skillRef;
                    }
                    
                    if (!["distinction", "passion"].includes(advantageSelect.value)) {
                        advantageConsultIcon.onclick = () => displayManager.consultContent(advantageConsultIcon, advantageSelect.value, "traits", null, true);
                        advantageConsultIcon.style.setProperty("visibility", "visible");
                    }
                    if (!["adversity", "anxiety"].includes(disadvantageSelect.value)) {
                        disadvantageConsultIcon.onclick = () => displayManager.consultContent(disadvantageConsultIcon, disadvantageSelect.value, "traits", null, true);
                        disadvantageConsultIcon.style.setProperty("visibility", "visible");
                    }

                    advantageSelect.onchange = () => {                        
                        if (["distinction", "passion"].includes(advantageSelect.value)) {
                            questionResults.Q13.advantage = {name: "", effects: [], groupRef: advantageSelect.value, typeRefs: []};
                            advantageConsultIcon.onclick = null;
                            advantageConsultIcon.style.setProperty("visibility", "hidden");
                            showCustomTrait(customAdvantageContainer, questionResults.Q13.advantage);
                        }
                        else {
                            advantageConsultIcon.onclick = () => displayManager.consultContent(advantageConsultIcon, advantageSelect.value, "traits", null, true);
                            advantageConsultIcon.style.setProperty("visibility", "visible");
                            customAdvantageContainer.style.setProperty("display", "none");
                            questionResults.Q13.advantage = {ref: advantageSelect.value};
                        }
                    }

                    disadvantageSelect.onchange = () => {
                        if (["adversity", "anxiety"].includes(disadvantageSelect.value)) {
                            questionResults.Q13.disadvantage = {name: "", effects: [], groupRef: disadvantageSelect.value, typeRefs: []};
                            disadvantageConsultIcon.onclick = null;
                            disadvantageConsultIcon.style.setProperty("visibility", "hidden");
                            showCustomTrait(customDisadvantageContainer, questionResults.Q13.disadvantage);
                        }
                        else {
                            disadvantageConsultIcon.onclick = () => displayManager.consultContent(disadvantageConsultIcon, disadvantageSelect.value, "traits", null, true);
                            disadvantageConsultIcon.style.setProperty("visibility", "visible");
                            customDisadvantageContainer.style.setProperty("display", "none");
                            questionResults.Q13.disadvantage = {ref: disadvantageSelect.value};
                        }
                    }

                    skillSelect.onchange = () => {
                        skillConsultIcon.onclick = () => displayManager.consultContent(skillConsultIcon, skillSelect.value, "skills", null, true);
                        questionResults.Q13.skillRef = skillSelect.value;
                    }
                    
                    break;
                }

                case 16:
                case 17:{

                    createTextArea("10em");

                    displayManager.createTextElement(questionPage, "p", dataManager.content.ui.characterCreation[`Q${questionNumber}`].instruction);

                    const refSet = new Set();
                    let contentGroup;
                    if (questionNumber === 16) {
                        for (const equipRef of Object.keys(dataManager.content.equipment)) {
                            const equipObject = dataManager.content.equipment[equipRef];
                            if (equipObject.groupRef === "item" && equipObject.rarity !== undefined && (equipObject.rarity <= 7 || equipObject.rarity[0] <= 7)) {
                                refSet.add(equipRef);
                                contentGroup = "equipment";
                            }
                        }
                    }
                    else if (questionNumber === 17) {
                        const knownSkillRefs = new Set([
                            dataManager.content.clans[questionResults.Q1.clanRef].skillRef,
                            ...dataManager.content.families[questionResults.Q2.familyRef].skillRefs,
                            ...questionResults.Q3.skillRefs
                        ]);
                        for (const skillRef of Object.keys(dataManager.content.skills)) {
                            if (!knownSkillRefs.has(skillRef)) {
                                refSet.add(skillRef);
                            }
                        }
                        contentGroup = "skills";
                    }

                    const selectLine = displayManager.createFlexLineContainer(questionPage);
                    const select = displayManager.createSelect(undefined, refSet, dataManager.content[contentGroup], "name");
                    const consultIcon = displayManager.createConsultIcon(selectLine, select.value, contentGroup);
                    selectLine.appendChild(select);                    

                    if(questionResults[`Q${questionNumber}`].gainRef === undefined) {
                        questionResults[`Q${questionNumber}`].gainRef = select.value;
                    }
                    else {
                        select.value = questionResults[`Q${questionNumber}`].gainRef;
                    }

                    select.onchange = () => {
                        consultIcon.onclick = () => displayManager.consultContent(consultIcon, select.value, contentGroup, null, true);
                        questionResults[`Q${questionNumber}`].gainRef = select.value;
                    }
                    
                    break;
                }
                case 18:{

                    createTextArea("10em");

                    displayManager.createTextElement(questionPage, "p", dataManager.content.ui.characterCreation.Q18.instruction);

                    const effects = [];
                    for (let i = 1; i <= 10; i++) {
                        
                        const rollMap = new Map();
                        // The default properties are for skills because it is the most common
                        effects.push({contentObject: dataManager.content.skills, rollMap: rollMap});

                        switch (i) {
                            case 1:
                            case 2:{
                                effects[i - 1].contentObject = dataManager.content.equipment;
                                rollMap.set([1, 2, 3], "weapon");
                                rollMap.set([4, 5, 6], "armor");
                                rollMap.set([7, 8], "item");
                                rollMap.set([9], "animal");
                                rollMap.set([10], "property");
                                break;
                            }
                            case 3:{
                                rollMap.set([1, 2, 3], "aesthetics");
                                rollMap.set([4, 5, 6], "composition");
                                rollMap.set([7, 8], "design");
                                rollMap.set([9, 10], "smithing");
                                break;
                            }
                            case 4:{
                                rollMap.set([1, 2, 3], "command");
                                rollMap.set([4, 5, 6], "courtesy");
                                rollMap.set([7, 8], "games");
                                rollMap.set([9, 10], "performance");
                                break;
                            }
                            case 5:{
                                rollMap.set([1, 2, 3], "culture");
                                rollMap.set([4, 5], "sentiment");
                                rollMap.set([6, 7], "government");
                                rollMap.set([8, 9], "medicine");
                                rollMap.set([10], "theology");
                                break;
                            }
                            case 6:{
                                rollMap.set([1, 2, 3], "fitness");
                                rollMap.set([4, 5], "martial arts [melee]");
                                rollMap.set([6, 7], "martial arts [ranged]");
                                rollMap.set([8], "martial arts [unarmed]");
                                rollMap.set([9], "tactics");
                                rollMap.set([10], "meditation");
                                break;
                            }
                            case 7:{
                                rollMap.set([1, 2, 3], "commerce");
                                rollMap.set([4, 5], "labor");
                                rollMap.set([6, 7], "seafaring");
                                rollMap.set([8], "skulduggery");
                                rollMap.set([9, 10], "survival");
                                break;
                            }
                            case 8:{
                                effects[i - 1].contentObject = dataManager.content.techniques;
                                rollMap.set([1, 2, 3], "kata");
                                rollMap.set([4, 5, 6], "shūji");
                                rollMap.set([7], "ritual");
                                rollMap.set([8], "invocation");
                                rollMap.set([9], "kihō");
                                rollMap.set([10], "mahō or ninjutsu");
                            }
                            // Cases 9 and 10 don't involve a roll
                        }
                    }

                    function getEffectRef(ancestorRollValue) {
                        if (ancestorRollValue <= 8) {
                            const effectRollValue = Math.floor(Math.random() * 10) + 1;
                            const ancestorEffects = effects[ancestorRollValue - 1];
                            for (const rollArray of ancestorEffects.rollMap.keys()) {
                                if (rollArray.includes(effectRollValue)) {
                                    return ancestorEffects.rollMap.get(rollArray);
                                }
                            }
                        }       
                    }

                    if(questionResults.Q18.ancestorIndex === undefined) {
                        const roll1 = Math.floor(Math.random() * 10) + 1;
                        const effectRef1 = getEffectRef(roll1);
                        const roll2 = Math.floor(Math.random() * 10) + 1;
                        const effectRef2 = getEffectRef(roll2);
                        questionResults.Q18 = {ancestorIndex: 0, values: [
                            {ancestorRoll: roll1, effectRef: effectRef1, extraRef: null},
                            {ancestorRoll: roll2, effectRef: effectRef2, extraRef: null}
                        ]};
                    }

                    const radioContainer = displayManager.createFlexColumnContainer(questionPage);

                    for (let i = 0; i < 2; i++) {

                        const ancestorLine = displayManager.createFlexLineContainer(radioContainer, "p");

                        const radioButton = document.createElement("input");
                        radioButton.type = "radio";
                        radioButton.name = "ancestor";
                        radioButton.value = i;
                        ancestorLine.appendChild(radioButton);

                        radioButton.checked = questionResults.Q18.ancestorIndex === i;

                        const ancestorContainer = displayManager.createFlexColumnContainer(ancestorLine, "div", ["frame", ["gap", "0.5em"]]);

                        const ancestorSelect = document.createElement("select");
                        for (let j = 1; j <= 10; j++) {
                            const option = document.createElement("option");
                            option.value = j;
                            option.text = `${j}. ${dataManager.content.ui.characterCreation.Q18.options[j - 1][0]}`;
                            ancestorSelect.options.add(option);
                        }
                        ancestorSelect.value = questionResults.Q18.values[i].ancestorRoll;

                        const ancestorSelectLine = displayManager.createFlexLineContainer(ancestorContainer);
                        ancestorSelectLine.appendChild(ancestorSelect);
                        displayManager.createButton(ancestorSelectLine, dataManager.content.ui.characterCreation.Q18.reroll, () => {
                            ancestorSelect.value = Math.floor(Math.random() * 10) + 1;
                            updateAncestor();
                        });

                        const descriptionText = displayManager.createTextElement(ancestorContainer, "span", dataManager.content.ui.characterCreation.Q18.options[ancestorSelect.value - 1][1]);
                        const modifierText = displayManager.createTextElement(ancestorContainer, "span", dataManager.content.ui.characterCreation.Q18.options[ancestorSelect.value - 1][2]);
                        const effectText = displayManager.createTextElement(ancestorContainer, "span", dataManager.content.ui.characterCreation.Q18.options[ancestorSelect.value - 1][3]);

                        const effectContainer = displayManager.createContainer(ancestorContainer, "div", [["display", "none"], ["flex-direction", "column"], ["gap", "0.5em"]]);

                        // If ancestorSelect.value === 9, effectSelect will not be used
                        const effectSelect = document.createElement("select");

                        generateEffectElements(questionResults.Q18.values[i].effectRef);

                        function generateEffectElements(effectRef) {

                            const ancestorRollValue = parseInt(ancestorSelect.value);

                            if (ancestorRollValue === 9) {
                                effectContainer.style.setProperty("display", "none");
                                return;
                            }

                            effectContainer.innerHTML = "";
                            effectSelect.innerHTML = "";
                            effectContainer.style.setProperty("display", "flex");
                            
                            if (ancestorRollValue <= 8) {
                                
                                const ancestorEffects = effects[ancestorRollValue - 1];

                                for (const rollArray of ancestorEffects.rollMap.keys()) {
                                    const option = document.createElement("option");

                                    const ref = ancestorEffects.rollMap.get(rollArray);
                                    option.value = ref;

                                    let rollRangeString;
                                    if (rollArray.length > 1) {
                                        rollRangeString = `${rollArray[0]}–${rollArray[rollArray.length - 1]}`;
                                    }
                                    else {
                                        rollRangeString = rollArray[0];
                                    }

                                    if (ancestorEffects.contentObject === dataManager.content.equipment) {
                                        option.text = rollRangeString + dataManager.content.ui.colon + dataManager.content.ui.equipmentGroupNames[ref];
                                    }
                                    else if (ancestorEffects.contentObject === dataManager.content.techniques) {
                                        if (ref === "mahō or ninjutsu") {
                                            option.text = rollRangeString + dataManager.content.ui.colon + dataManager.content.ui.characterCreation.Q18.mahōNinjutsu;
                                        }
                                        else {
                                            option.text = rollRangeString + dataManager.content.ui.colon + dataManager.content.ui.techniqueGroupNames[ref];
                                        }
                                    }
                                    else {
                                        option.text = rollRangeString + dataManager.content.ui.colon + ancestorEffects.contentObject[ref].name;
                                    }
                                    effectSelect.options.add(option);
                                }
                                effectSelect.value = effectRef;

                                const effectSelectLine = displayManager.createFlexLineContainer(effectContainer);
                                const effectConsultIcon =  displayManager.createTextElement(effectSelectLine, "span", String.fromCharCode(dataManager.content.ui.customIcons.consultIcon), ["alignCenter", "largeFontSize", "pointer"]);
                                if ([3, 4, 5, 6, 7].includes(ancestorRollValue)) {
                                    effectConsultIcon.onclick = () => displayManager.consultContent(effectConsultIcon, effectSelect.value, "skills", null, true);
                                }
                                else {
                                    effectConsultIcon.style.setProperty("display", "none");
                                }
                                effectSelectLine.appendChild(effectConsultIcon);
                                effectSelectLine.appendChild(effectSelect);
                                displayManager.createButton(effectSelectLine, dataManager.content.ui.characterCreation.Q18.reroll, () => {
                                    effectSelect.value = getEffectRef(ancestorSelect.value);
                                    questionResults.Q18.values[i].extraRef = null;
                                    generateExtraElements();
                                    questionResults.Q18.values[i].effectRef = effectSelect.value;
                                });

                                const extraSelectLine = displayManager.createContainer(effectContainer, "div", [["display", "none"], ["gap", "0.5em"]]);

                                generateExtraElements();

                                function generateExtraElements() {
                                    if (ancestorRollValue === 1 || ancestorRollValue === 8) {
                                        extraSelectLine.innerHTML = "";
                                        extraSelectLine.style.setProperty("display", "flex");
    
                                        const extraSelect = document.createElement("select");
                                        for (const extraRef of Object.keys(ancestorEffects.contentObject)) {

                                            const available = ancestorEffects.contentObject !== dataManager.content.techniques || ancestorEffects.contentObject[extraRef].rank === 1;
                                            
                                            const normalMatch = ancestorEffects.contentObject[extraRef].groupRef === effectSelect.value;
                                            const specialMatch = effectSelect.value === "mahō or ninjutsu" && (ancestorEffects.contentObject[extraRef].groupRef === "mahō" || ancestorEffects.contentObject[extraRef].groupRef === "ninjutsu");
                                            const effectSelectMatch = normalMatch || specialMatch;

                                            if (available && effectSelectMatch) {
                                                const option = document.createElement("option");
                                                option.value = extraRef;
                                                option.text = ancestorEffects.contentObject[extraRef].name;
                                                extraSelect.options.add(option);
                                            }                                        
                                        }
                                        const extraConsultIcon =  displayManager.createTextElement(extraSelectLine, "span", String.fromCharCode(dataManager.content.ui.customIcons.consultIcon), ["alignCenter", "largeFontSize", "pointer"]);
                                        if (ancestorRollValue === 1) {
                                            extraConsultIcon.onclick = () => displayManager.consultContent(extraConsultIcon, extraSelect.value, "equipment", null, true);
                                        }else {
                                            extraConsultIcon.onclick = () => displayManager.consultContent(extraConsultIcon, extraSelect.value, "techniques", null, true);
                                        }
                                        extraSelectLine.appendChild(extraSelect);    
                                        
                                        if (questionResults.Q18.values[i].extraRef !== null) {
                                            extraSelect.value = questionResults.Q18.values[i].extraRef;
                                        }
                                        else {
                                            questionResults.Q18.values[i].extraRef = extraSelect.value;
                                        }
    
                                        extraSelect.onchange = () => {
                                            if (ancestorRollValue === 1) {
                                                extraConsultIcon.onclick = () => displayManager.consultContent(extraConsultIcon, extraSelect.value, "equipment", null, true);
                                            }else {
                                                extraConsultIcon.onclick = () => displayManager.consultContent(extraConsultIcon, extraSelect.value, "techniques", null, true);
                                            }
                                            questionResults.Q18.values[i].extraRef = extraSelect.value;
                                        }
                                    }
                                    else {
                                        questionResults.Q18.values[i].extraRef = null;
                                        extraSelectLine.style.setProperty("display", "none");
                                    }
                                }

                                const instructionRefs = ["playerItemQuality", "gmItemQuality"];
                                if(ancestorRollValue === 1) {

                                    if (questionResults.Q18.values[i].qualityRefs === undefined) {
                                        questionResults.Q18.values[i].qualityRefs = [];
                                    }                                    

                                    for (let j = 0; j < 2; j++) {

                                        const qualityLine = displayManager.createFlexLineContainer(effectContainer);
                                        displayManager.createTextElement(qualityLine, "span", dataManager.content.ui.characterCreation.Q18[instructionRefs[j]] + dataManager.content.ui.colon);
                                        const qualitySelect = displayManager.createSelect(qualityLine, Object.keys(dataManager.content.qualities), dataManager.content.qualities, "name");

                                        if (questionResults.Q18.values[i].qualityRefs[j] !== undefined) {
                                            qualitySelect.value = questionResults.Q18.values[i].qualityRefs[j];
                                        }
                                        else {
                                            questionResults.Q18.values[i].qualityRefs[j] = qualitySelect.value;
                                        }

                                        qualitySelect.onchange = () => questionResults.Q18.values[i].qualityRefs[j] = qualitySelect.value;
                                    }
                                }
                                
                                effectSelect.onchange = () => {
                                    questionResults.Q18.values[i].extraRef = null;
                                    generateExtraElements();
                                    questionResults.Q18.values[i].effectRef = effectSelect.value;

                                    if ([3, 4, 5, 6, 7].includes(ancestorRollValue)) {
                                        effectConsultIcon.style.setProperty("display", "inline");
                                        effectConsultIcon.onclick = () => displayManager.consultContent(effectConsultIcon, effectSelect.value, "skills", null, true);
                                    }
                                    else {
                                        effectConsultIcon.style.setProperty("display", "none");
                                    }                                    
                                }
                            }
                            else if (ancestorRollValue === 10) {
                                for (const ref of ["change rings", "item"]) {
                                    const option = document.createElement("option");
                                    option.value = ref;
                                    option.text = dataManager.content.ui.characterCreation.Q18[ref];
                                    effectSelect.options.add(option);
                                }
                                effectContainer.appendChild(effectSelect);

                                const extraSelectLine = displayManager.createFlexLineContainer(effectContainer);
                                const extraConsultIcon =  displayManager.createTextElement(extraSelectLine, "span", String.fromCharCode(dataManager.content.ui.customIcons.consultIcon), ["alignCenter", "largeFontSize", "pointer"]);
                                if (effectSelect.value === "change rings") {
                                    extraConsultIcon.style.setProperty("display", "none");
                                }else {
                                    extraConsultIcon.onclick = () => displayManager.consultContent(extraConsultIcon, extraSelect.value, "equipment", null, true);
                                }
                                const extraSelect = document.createElement("select");
                                extraSelectLine.appendChild(extraSelect);
                                
                                if (effectRef !== undefined) {
                                    effectSelect.value = effectRef;
                                }
                                else {
                                    questionResults.Q18.values[i].effectRef = effectSelect.value;
                                }

                                generateExtraElements();

                                function generateExtraElements() {
                                    extraSelect.innerHTML = "";                                    

                                    if (effectSelect.value === "change rings") {

                                        const ringValues = getQ18ringValues();

                                        // The first property ("any") of dataManager.content.rings is not used
                                        for (const ringRef1 of Object.keys(ringValues)) {
                                            if (ringValues[ringRef1] > 1) {
                                                for (const ringRef2 of Object.keys(ringValues)) {
                                                    if (ringValues[ringRef2] < 3 && ringRef2 !== ringRef1) {
                                                        const option = document.createElement("option");
                                                        option.value = ringRef1 + "⇨" + ringRef2;
                                                        option.text = `${dataManager.content.rings[ringRef1].name} (${ringValues[ringRef1]} ⇨ ${ringValues[ringRef1] - 1}), ${dataManager.content.rings[ringRef2].name} (${ringValues[ringRef2]} ⇨ ${ringValues[ringRef2] + 1})`;
                                                        extraSelect.options.add(option);
                                                    }
                                                }
                                            }
                                        }

                                        extraConsultIcon.style.setProperty("display", "none");
                                    }
                                    else {
                                        for (const equipRef of Object.keys(dataManager.content.equipment)) {
                                            const equipObject = dataManager.content.equipment[equipRef];
                                            if (equipObject.groupRef === "item" && equipObject.rarity !== undefined && (equipObject.rarity <= 6 || equipObject.rarity[0] <= 6)) {
                                                const option = document.createElement("option");
                                                option.value = equipRef;
                                                option.text = equipObject.name;
                                                extraSelect.options.add(option);
                                            }
                                        }

                                        extraConsultIcon.style.setProperty("display", "inline");
                                        extraConsultIcon.onclick = () => displayManager.consultContent(extraConsultIcon, extraSelect.value, "equipment", null, true);
                                    }
                                }

                                if (questionResults.Q18.values[i].extraRef !== null) {
                                    extraSelect.value = questionResults.Q18.values[i].extraRef;
                                }
                                else {
                                    questionResults.Q18.values[i].extraRef = extraSelect.value;
                                }

                                extraSelect.onchange = () => questionResults.Q18.values[i].extraRef = extraSelect.value;

                                effectSelect.onchange = () => {
                                    questionResults.Q18.values[i].extraRef = null;
                                    generateExtraElements();
                                    questionResults.Q18.values[i].effectRef = effectSelect.value;
                                }
                            }
                        }

                        radioButton.onchange = () => {
                            if (radioButton.checked) {                                
                                questionResults.Q18.ancestorIndex = parseInt(radioButton.value);
                            }
                        }

                        ancestorSelect.onchange = updateAncestor;

                        function updateAncestor() {
                            questionResults.Q18.values[i].ancestorRoll = parseInt(ancestorSelect.value);
                            descriptionText.textContent = dataManager.content.ui.characterCreation.Q18.options[ancestorSelect.value - 1][1];
                            modifierText.textContent = dataManager.content.ui.characterCreation.Q18.options[ancestorSelect.value - 1][2];
                            effectText.textContent = dataManager.content.ui.characterCreation.Q18.options[ancestorSelect.value - 1][3];
                            questionResults.Q18.values[i].extraRef = null;
                            generateEffectElements(getEffectRef(ancestorSelect.value));
                            questionResults.Q18.values[i].effectRef = effectSelect.value;                            
                        }
                    }
                    break;
                }
                case 19:{
                    
                    const nameInput = document.createElement("input");
                    nameInput.type = "text";
                    nameInput.classList.add("textInput");
                    questionPage.appendChild(nameInput);

                    if (questionResults.Q19 === undefined) {
                        questionResults.Q19 = {text: ""};
                    }

                    if(questionResults.Q19.text !== "") {
                        nameInput.value = questionResults.Q19.text;
                    }
                    else {
                        changeNextQuestionButtonState(false);
                    }

                    const existingCharacterNames = [];
                    for (const option of dataManager.availableCharacterOptions) {
                        existingCharacterNames.push(option.text);
                    }

                    nameInput.onchange = () => {
                        if (nameInput.value.length > 0 && !existingCharacterNames.includes(`${dataManager.content.families[questionResults.Q2.familyRef].name} ${nameInput.value}`)) {
                            questionResults.Q19.text = nameInput.value;
                            changeNextQuestionButtonState(true);
                        }
                        else {
                            changeNextQuestionButtonState(false);
                            // ASK TO ENTER A CHARACTER NAME THAT DOESN'T EXIST ALREADY
                        }
                    }

                    break;
                }
                case 21:{

                    const instruction = displayManager.createTextElement(questionPage, "p", "", [["display", "none"]]);
                    
                    creationObject.personalName = questionResults.Q19.text;
                    creationObject.clanRef = questionResults.Q1.clanRef;
                    creationObject.familyRef = questionResults.Q2.familyRef;
                    creationObject.schoolRef = questionResults.Q3.schoolRef;
                    creationObject.appearance = questionResults.Q14.text;
                    creationObject.giri = questionResults.Q5.text;
                    creationObject.ninjō = questionResults.Q6.text;

                    const relationshipArray = [
                        questionResults.Q7.text,
                        questionResults.Q13.text,
                        questionResults.Q16.text,
                        questionResults.Q17.text,
                        questionResults.Q18.text
                    ];
                    const personalityArray = [                            
                        questionResults.Q8.text,
                        questionResults.Q9.text,
                        questionResults.Q10.text,
                        questionResults.Q11.text,
                        questionResults.Q12.text,
                        questionResults.Q15.text,
                        questionResults.Q20.text
                    ];
                    
                    combineStrings(relationshipArray, "relationships");
                    combineStrings(personalityArray, "personality");

                    function combineStrings(stringArray, propertyName) {
                        creationObject[propertyName] = "";
                        for (let i = 0; i < stringArray.length; i++) {
                            creationObject[propertyName] += stringArray[i];
                            if (i < stringArray.length - 1) {
                                creationObject[propertyName] += "\n\n";
                            }
                        }
                    }

                    creationObject.traitData = [
                        questionResults.Q9.traitData,
                        questionResults.Q10.traitData,
                        questionResults.Q11.traitData,
                        questionResults.Q12.traitData,
                        questionResults.Q13[questionResults.Q13.propertyName]
                    ]

                    creationObject.startingRingsObj = getQ18ringValues();                    

                    creationObject.honor = dataManager.content.schools[questionResults.Q3.schoolRef].honor;
                    creationObject.glory = dataManager.content.families[questionResults.Q2.familyRef].glory;
                    creationObject.status = dataManager.content.clans[questionResults.Q1.clanRef].status;

                    const skillRefArray = [dataManager.content.clans[questionResults.Q1.clanRef].skillRef].concat(dataManager.content.families[questionResults.Q2.familyRef].skillRefs.concat([...questionResults.Q3.skillRefs]));
                    if (questionResults.Q7.gainRef === "stat") {
                        creationObject.glory += 5;
                    }
                    else {
                        skillRefArray.push(questionResults.Q7.gainRef);
                    }
                    if (questionResults.Q8.gainRef === "stat") {
                        creationObject.honor += 10;
                    }
                    else {
                        skillRefArray.push(questionResults.Q8.gainRef);
                    }
                    if (questionResults.Q13.propertyName === "disadvantage") {
                        skillRefArray.push(questionResults.Q13.skillRef);
                    }
                    skillRefArray.push(questionResults.Q17.gainRef);

                    creationObject.startingTechRefs = [];
                    for (const techRefSet of questionResults.Q3.techRefSets) {
                        for (const techRef of techRefSet) {
                            creationObject.startingTechRefs.push(techRef);
                        }
                    }
                    
                    function addEquipment(equipmentRefData) {

                        function createOrIncrease(equipmentRef, amount) {
                            const existingObj = creationObject.equipmentData.find((obj) => obj.ref === equipmentRef);
                            if (existingObj === undefined) {
                                creationObject.equipmentData.push({ref: equipmentRef, amount: amount});
                            }
                            else {
                                existingObj.amount += amount;
                            }
                        }
                        if (typeof equipmentRefData === "string") {
                            createOrIncrease(equipmentRefData, 1)
                        }
                        else if (Array.isArray(equipmentRefData)) {
                            createOrIncrease(equipmentRefData[0], equipmentRefData[1])
                        }
                        else {
                            for (const otherEquipmentRefData of equipmentRefData.displayed[equipmentRefData.chosenIndex]) {
                                addEquipment(otherEquipmentRefData);
                            }
                        }
                    }
                    // Clone questionResults.Q3.equipmentRefData then add other equipmentRefData
                    const equipRefDataArray = [...questionResults.Q3.equipmentRefData];
                    equipRefDataArray.push(questionResults.Q16.gainRef);
                    equipRefDataArray.push(["koku", dataManager.content.families[questionResults.Q2.familyRef].koku]);
                    creationObject.equipmentData = [];
                    for (const equipRefData of equipRefDataArray) {
                        addEquipment(equipRefData);
                    }

                    const ancestorValues = questionResults.Q18.values[questionResults.Q18.ancestorIndex];
                    if (ancestorValues.ancestorRoll === 1) {
                        creationObject.glory += 3;
                        let qualityRefs = ancestorValues.qualityRefs;
                        if (dataManager.content.equipment[ancestorValues.extraRef].qualityRefs !== undefined) {
                            qualityRefs = qualityRefs.concat(dataManager.content.equipment[ancestorValues.extraRef].qualityRefs);
                        }
                        creationObject.equipmentData.push({
                            ref: ancestorValues.extraRef,
                            amount: 1,
                            qualityRefs: qualityRefs
                        });
                    }
                    else if (ancestorValues.ancestorRoll === 2) {
                        creationObject.honor += 5;
                        creationObject.glory += 5;
                    }
                    else if (ancestorValues.ancestorRoll === 8) {
                        creationObject.honor -= 5;
                        creationObject.startingTechRefs.push(ancestorValues.extraRef);
                    }
                    else if (ancestorValues.ancestorRoll === 9) {
                        creationObject.status += 10;
                        creationObject.traitData.push({ref: "Blessed Lineage"});
                    }
                    else if (ancestorValues.ancestorRoll === 10) {
                        creationObject.glory -= 3;
                        if (ancestorValues.effectRef === "change rings") {
                            const ringRefs = ancestorValues.extraRef.split("⇨");
                            creationObject.startingRingsObj[ringRefs[0]] -= 1;
                            creationObject.startingRingsObj[ringRefs[1]] += 1;
                        }
                        else {
                            creationObject.equipmentData.push({
                                equipmentRef: ancestorValues.extraRef,
                                amount: 1
                            });
                        }
                    }
                    else {
                        skillRefArray.push(ancestorValues.effectRef);

                        if (ancestorValues.ancestorRoll === 3) {
                            creationObject.glory += 5;
                        }
                        else if (ancestorValues.ancestorRoll === 4) {
                            creationObject.glory -= 3;
                        }
                        else if (ancestorValues.ancestorRoll === 5) {
                            creationObject.glory += 3;
                        }
                        else if (ancestorValues.ancestorRoll === 6) {
                            creationObject.honor -= 5;
                        }
                        else {
                            creationObject.glory -= 3;
                            creationObject.honor += 3;
                        }
                    }

                    creationObject.startingSkillsObj = {};
                    let excessSkillRanks = false;                    
                    for (const skillRef of skillRefArray) {
                        if (!Object.keys(creationObject.startingSkillsObj).includes(skillRef)) {
                            creationObject.startingSkillsObj[skillRef] = 1;
                        }
                        else {
                            creationObject.startingSkillsObj[skillRef] += 1;
                        }
                        if (creationObject.startingSkillsObj[skillRef] > 3) {
                            excessSkillRanks = true;
                        }
                    }
                    if (excessSkillRanks) {
                        for (const skillRef of Object.keys(dataManager.content.skills)) {
                            if (!Object.keys(creationObject.startingSkillsObj).includes(skillRef)) {
                                creationObject.startingSkillsObj[skillRef] = 0;
                            }                            
                        }
                    }

                    const summaryGrid = displayManager.createGridContainer(questionPage, "div", [["grid-auto-flow", "column"], ["gap", "0.5em"]]);
                    const topContainer = displayManager.createGridContainer(summaryGrid, "div", ["frame", ["gap", "0.5em"], ["align-items", "center"]]);
                    const clanIcon = displayManager.createTextElement(topContainer, "span", String.fromCharCode(dataManager.content.ui.customIcons[`${creationObject.clanRef}Icon`]), ["giantIcon", ["justify-self", "center"]]);
                    
                    if (window.innerWidth < 500) {
                        summaryGrid.style.setProperty("grid-template-rows", "repeat(9, auto)");
                        topContainer.style.setProperty("grid-template-columns", "1fr 4fr");
                        clanIcon.style.setProperty("grid-row", "span 2");
                    }
                    else {
                        summaryGrid.style.setProperty("grid-template-rows", "repeat(5, auto)");
                        topContainer.style.setProperty("grid-column", "span 2");
                        topContainer.style.setProperty("grid-template-columns", "1fr 3fr 2fr");
                    }

                    const profileContainer = displayManager.createFlexColumnContainer(topContainer, "div", [["gap", "0.5em"]]);

                    const characterNameLine = displayManager.createFlexLineContainer(profileContainer);
                    displayManager.createTextElement(characterNameLine, "span", dataManager.content.ui.name + dataManager.content.ui.colon, ["bold"]);
                    displayManager.createTextElement(characterNameLine, "span", dataManager.content.families[creationObject.familyRef].name + " " + creationObject.personalName);

                    const clanLine = displayManager.createFlexLineContainer(profileContainer);
                    displayManager.createTextElement(clanLine, "span", dataManager.content.ui.clan + dataManager.content.ui.colon, ["bold"]);
                    displayManager.createTextElement(clanLine, "span", dataManager.content.clans[creationObject.clanRef].name);

                    const schoolLine = displayManager.createFlexLineContainer(profileContainer);
                    displayManager.createTextElement(schoolLine, "span", dataManager.content.ui.school + dataManager.content.ui.colon, ["bold"]);
                    displayManager.createTextElement(schoolLine, "span", dataManager.content.schools[creationObject.schoolRef].name);

                    const statContainer = displayManager.createFlexColumnContainer(topContainer, "div", [["gap", "0.5em"]]);

                    const honorLine = displayManager.createFlexLineContainer(statContainer);
                    displayManager.createTextElement(honorLine, "span", dataManager.content.ui.honor + dataManager.content.ui.colon, ["bold"]);
                    displayManager.createTextElement(honorLine, "span", creationObject.honor);

                    const gloryLine = displayManager.createFlexLineContainer(statContainer);
                    displayManager.createTextElement(gloryLine, "span", dataManager.content.ui.glory + dataManager.content.ui.colon, ["bold"]);
                    displayManager.createTextElement(gloryLine, "span", creationObject.glory);

                    const statusLine = displayManager.createFlexLineContainer(statContainer);
                    displayManager.createTextElement(statusLine, "span", dataManager.content.ui.status + dataManager.content.ui.colon, ["bold"]);
                    displayManager.createTextElement(statusLine, "span", creationObject.status);

                    const creationData = {
                        rings: {title: dataManager.content.ui.rings, values:creationObject.startingRingsObj, source: dataManager.content.rings, excessRanks: 0},
                        skills: {title: dataManager.content.ui.skills, values:creationObject.startingSkillsObj, source: dataManager.content.skills, excessRanks: 0},
                        techniques: {title: dataManager.content.ui.techniques, values: creationObject.startingTechRefs, source: dataManager.content.techniques},
                        traits: {title: dataManager.content.ui.traits, values: creationObject.traitData, source: dataManager.content.traits},
                        equipment: {title: dataManager.content.ui.equipment, values: creationObject.equipmentData, source: dataManager.content.equipment}
                    };
                    
                    for (const key of Object.keys(creationData)) {
                        const container = displayManager.createFlexColumnContainer(summaryGrid, "div", ["frame", ["gap", "0.5em"]]);
                        if (key === "skills") {
                            container.style.setProperty("grid-row", "span 3");
                        }
                        if (key === "equipment") {
                            container.style.setProperty("grid-row", "span 2");
                        }

                        const bold = displayManager.createTextElement(container, "span", creationData[key].title, ["bold"]);

                        const list = displayManager.createGridContainer(container, "div", [["gap", "0.5em"], ["grid-template-columns", "auto 1fr auto"], ["align-items", "center"]]);

                        if (["rings", "skills"].includes(key)) {
    
                            let excessRanks = false;

                            for (const ref of Object.keys(creationData[key].values)) {
                                if (creationData[key].values[ref] > 3) {
                                    creationData[key].excessRanks += creationData[key].values[ref] - 3;
                                    creationData[key].values[ref] = 3;
                                    excessRanks = true;
                                }
                            }
                            const initialValues = {...creationData[key].values}
                            if (excessRanks) {
                                changeNextQuestionButtonState(false);
                            }

                            createList();

                            function createList() {
                                if (excessRanks) {
                                    bold.textContent = `${creationData[key].title} (${dataManager.content.ui.characterCreation.summary.excessRanks + dataManager.content.ui.colon + creationData[key].excessRanks})`;
                                }                                

                                list.innerHTML = "";

                                for (const ref of Object.keys(creationData[key].values)) {
                                    
                                    displayManager.createConsultIcon(list, ref, key);
                                    displayManager.createTextElement(list, "span", creationData[key].source[ref].name);
                                    
                                    if((creationData[key].excessRanks > 0 && creationData[key].values[ref] < 3) || creationData[key].values[ref] > initialValues[ref]) {
                                        const rankSelect = document.createElement("select");
                                        list.appendChild(rankSelect);
                                        for (let i = initialValues[ref]; i <= Math.min(creationData[key].values[ref] + creationData[key].excessRanks, 3); i++) {
                                            const option = document.createElement("option");
                                            option.value = i;
                                            option.text = i;
                                            rankSelect.options.add(option);
                                        }
                                        rankSelect.value = creationData[key].values[ref];

                                        rankSelect.onchange = () => {
                                            creationData[key].excessRanks -= rankSelect.value - creationData[key].values[ref];
                                            creationData[key].values[ref] = parseInt(rankSelect.value);
                                            createList();
                                            if (creationData.rings.excessRanks === 0 && creationData.skills.excessRanks === 0) {
                                                changeNextQuestionButtonState(true);
                                            }
                                        }
                                    }
                                    else {
                                        displayManager.createTextElement(list, "span", Math.min(creationData[key].values[ref], 3), [["justify-self", "center"]]);
                                    }
                                }
                            }
                        }
                        else if (key === "techniques") {
                            list.style.setProperty("grid-template-columns", "auto 1fr");

                            for (const ref of creationData[key].values) {

                                displayManager.createConsultIcon(list, ref, key);
                                displayManager.createTextElement(list, "span", creationData[key].source[ref].name);
                            }
                        }
                        else {
                            if (key === "traits") {
                                list.style.setProperty("grid-template-columns", "auto 1fr");

                                for (const obj of creationData[key].values) {
                                    createButtonAndName(obj);
                                }
                            }
                            else {
                                list.style.setProperty("grid-template-columns", "auto 1fr auto");

                                for (const obj of creationData[key].values) {
                                    createButtonAndName(obj);

                                    displayManager.createTextElement(list, "span", "x " + obj.amount);
                                }
                            }

                            function createButtonAndName(obj) {
                                
                                let content;
                                if (obj.ref !== undefined) {
                                    content = creationData[key].source[obj.ref];
                                }
                                else {
                                    content = obj;
                                }

                                displayManager.createConsultIcon(list, content, key);
                                displayManager.createTextElement(list, "span", content.name);
                            }
                        }
                    }

                    if (creationData.rings.excessRanks > 0 || creationData.skills.excessRanks > 0) {
                        instruction.style.setProperty("display", "inline");
                        instruction.textContent = dataManager.content.ui.characterCreation.summary.rankLimit;
                        instruction.classList.add("bold");                        
                    }

                    break;
                }
                case 22:{
                    for (let i = displayManager.overlays.visible.length - 1; i >=0; i--) {
                        displayManager.hideOverlay(displayManager.overlays.visible[i]);
                    }
                    
                    for (const skillRef of Object.keys(creationObject.startingSkillsObj)) {
                        if (creationObject.startingSkillsObj[skillRef] === 0) {
                            delete creationObject.startingSkillsObj[skillRef];
                        }
                    }

                    const newCharacter = new Character(
                        creationObject.personalName,
                        creationObject.clanRef,
                        creationObject.familyRef,
                        creationObject.schoolRef,
                        creationObject.appearance,
                        creationObject.giri,
                        creationObject.ninjō,
                        creationObject.relationships,
                        creationObject.personality,
                        creationObject.traitData,
                        creationObject.startingRingsObj,
                        creationObject.startingSkillsObj,
                        creationObject.startingTechRefs,
                        creationObject.equipmentData,
                        creationObject.honor,
                        creationObject.glory,
                        creationObject.status
                    );

                    dataManager.cacheCharacter(newCharacter);
                    dataManager.changeCharacterAvailability(dataManager.content.families[newCharacter.familyRef].name + " " + newCharacter.personalName);
                    dataManager.loadOrResetCharacter(newCharacter);
                }
            }

            function showCustomTrait(customTraitContainer, savedTraitData) {

                customTraitContainer.style.setProperty("display", "flex");
                customTraitContainer.innerHTML = "";

                const nameLine = displayManager.createFlexLineContainer(customTraitContainer);
                displayManager.createTextElement(nameLine, "span", dataManager.content.ui.name + dataManager.content.ui.colon, ["bold"]);
                const traitNameInput = document.createElement("input");
                traitNameInput.type = "text";
                traitNameInput.classList.add("textInput");
                nameLine.appendChild(traitNameInput);
                traitNameInput.onchange = () => {
                    savedTraitData.name = traitNameInput.value;
                }

                const effectsContainer = displayManager.createFlexColumnContainer(customTraitContainer);
                displayManager.createTextElement(effectsContainer, "span", dataManager.content.ui.effects + dataManager.content.ui.colon, ["bold"]);
                const traitEffectsInput = document.createElement("textarea");
                traitEffectsInput.classList.add("textInput");
                effectsContainer.appendChild(traitEffectsInput);
                traitEffectsInput.onchange = () => {
                    savedTraitData.effects = traitEffectsInput.value.split(/\r\n|\r|\n/g);
                }

                const ringLine = displayManager.createFlexLineContainer(customTraitContainer);
                displayManager.createTextElement(ringLine, "span", dataManager.content.ui.ring + dataManager.content.ui.colon, ["bold"]);                
                const ringSelect = displayManager.createSelect(undefined, dataManager.individualRingRefs, dataManager.content.rings, "name");
                const consultIcon = displayManager.createConsultIcon(ringLine, ringSelect.value, "rings");
                ringLine.appendChild(ringSelect);
                ringSelect.onchange = () => {
                    consultIcon.onclick = () => displayManager.consultContent(consultIcon, ringSelect.value, "rings", null, true);
                    savedTraitData.ringRef = ringSelect.value;
                }

                traitNameInput.value = savedTraitData.name;
                for (let i = 0; i < savedTraitData.effects.length; i++) {
                    traitEffectsInput.value += savedTraitData.effects[i];
                    if (i < savedTraitData.effects.length - 1) {
                        traitEffectsInput.value += "\n";
                    }
                }
                if (savedTraitData.ringRef !== undefined) {
                    ringSelect.value = savedTraitData.ringRef;
                }
                else {
                    savedTraitData.ringRef = ringSelect.value;
                }
                

                const typeContainer = displayManager.createFlexColumnContainer(customTraitContainer);
                displayManager.createTextElement(typeContainer, "span", dataManager.content.ui.types + dataManager.content.ui.colon, ["bold"]);

                for (const traitTypeRef of Object.keys(dataManager.content.ui.traitTypeNames)) {
                    const typeLine = displayManager.createFlexLineContainer(typeContainer);

                    const checkbox = displayManager.createCheckbox(typeLine, () => {
                        if (checkbox.checked) {
                            savedTraitData.typeRefs.push(traitTypeRef);
                        }
                        else {
                            const index = savedTraitData.typeRefs.indexOf(traitTypeRef);
                            if (index > -1) {
                                savedTraitData.typeRefs.splice(index, 1);
                            }
                        }
                    });
                    if (savedTraitData.typeRefs.includes(traitTypeRef)) {
                        checkbox.checked = true;
                    }

                    displayManager.createTextElement(typeLine, "span", dataManager.content.ui.traitTypeNames[traitTypeRef]);
                }
            }            

            if (questionNumber === 1) {
                previousQuestionButton.textContent = dataManager.content.ui.characterCreation.cancel;
            }
            else {
                previousQuestionButton.textContent = `< ${dataManager.content.ui.characterCreation.previousQuestion}`;
                previousQuestionButton.style.setProperty("display", "inline");
            }

            if (questionNumber < 21) {
                nextQuestionButton.textContent = `${dataManager.content.ui.characterCreation.nextQuestion} >`;
            }
            else {
                nextQuestionButton.textContent = dataManager.content.ui.characterCreation.finalize;
            }
        }

        currentOverlay.viewer.appendChild(fragment);
    }

    consultContent(originElement, refOrObj, contentGroup, optionalRingRef, noCharacter, recycleViewer) {

        let contentRef;
        let content;
        if (typeof refOrObj === "string") {
            contentRef = refOrObj;
            content = dataManager.content[contentGroup][refOrObj];
        }
        else {
            content = refOrObj;
        }

        let displayedRing = null;
        if (optionalRingRef !== undefined && optionalRingRef !== null) {
            displayedRing = dataManager.content.rings[optionalRingRef];
        }

        let currentOverlay;
        if(recycleViewer) {
            currentOverlay = displayManager.overlays.visible[displayManager.overlays.visible.length - 1];
            currentOverlay.viewer.innerHTML = "";
        }
        else {
            currentOverlay = displayManager.openViewer(displayManager.overlays.styles.consult, originElement);
        }

        // Create the fragment that will contain the new viewer elements
        const fragment = document.createDocumentFragment();

        // Create elements to display, each with the proper content and classes for styling
        const fragmentAppendQueue = [];

        const customIcons = dataManager.content.ui.customIcons;

        if (contentGroup !== "rings") {

            const attributeContainer = displayManager.createFlexLineContainer(fragmentAppendQueue, "div", [["justify-content", "space-between"]]);
            const attributesAppendQueue = [];

            
            const groupSpan = document.createElement("span");

            if (contentGroup === "skills") {
                groupSpan.textContent = dataManager.content.ui.skillGroups[content.groupRef].skill;
                attributesAppendQueue.push(groupSpan);

                createRingButtons();
            }
            else if (contentGroup === "techniques") {

                if (content.rank < 7) {
                    displayManager.createTextElement(attributesAppendQueue, "span", `${dataManager.content.ui.rank} ${content.rank}`);
                }                

                let groupIcon;
                if (["kata", "kihō", "invocation", "ritual", "shūji", "mahō", "ninjutsu"].includes(content.groupRef)) {
                    groupIcon = String.fromCharCode(customIcons[`${content.groupRef}Icon`]);
                }
                else if (["schoolAbility", "masteryAbility"].includes(content.groupRef)) {
                    groupIcon = String.fromCharCode(customIcons.schoolIcon);
                }
                else {
                    groupIcon = String.fromCharCode(customIcons.titleIcon);
                }
                
                groupSpan.textContent = groupIcon + " " + dataManager.content.ui.techniqueGroupNames[content.groupRef];
                attributesAppendQueue.push(groupSpan);
                
                if (content.ringRef !== null) {
                    setDisplayedRing();
                }
                else if (content.activationSet.has("tn")) {            
                    createRingButtons();
                }

                if (content.clanRef !== undefined) {
                    displayManager.createTextElement(attributesAppendQueue, "span", String.fromCharCode(customIcons[`${content.clanRef}Icon`]) + " " + dataManager.content.clans[content.clanRef].name);
                }
            }
            else if (contentGroup === "traits") {

                groupSpan.textContent = dataManager.content.ui.traitGroupNames[content.groupRef];
                attributesAppendQueue.push(groupSpan);

                if (content.ringRef !== null) {
                    setDisplayedRing();
                }

                const typeSpan = displayManager.createTextElement(attributesAppendQueue, "span");
                for (let i = 0; i < content.typeRefs.length; i++) {
                    typeSpan.textContent += dataManager.content.ui.traitTypeNames[content.typeRefs[i]];
                    if (i < content.typeRefs.length - 1) {
                        typeSpan.textContent += ", ";
                    }
                }
            }

            function setDisplayedRing() {
                displayedRing = dataManager.content.rings[content.ringRef];
                displayManager.createTextElement(attributesAppendQueue, "span", String.fromCharCode(customIcons[`${content.ringRef}Icon`]) + " " + displayedRing.name);
            }

            function createRingButtons() {
                const buttonContainer = displayManager.createFlexContainer(attributesAppendQueue, "div", ["ringBar"]);
                for (const buttonRingRef of dataManager.individualRingRefs) {
                    const button = displayManager.createButton(buttonContainer, String.fromCharCode(customIcons[`${buttonRingRef}Icon`]), () => displayManager.consultContent(originElement, content, contentGroup, buttonRingRef, noCharacter, true));
                    if (dataManager.content.rings[buttonRingRef] === displayedRing) {
                        button.classList.add("currentTab", buttonRingRef);
                    }
                    buttonContainer.appendChild(button);
                }
            }

            for (const element of attributesAppendQueue) {
                attributeContainer.appendChild(element);
            }
        }

        const nameContainer = displayManager.createContainer(fragmentAppendQueue, "p", ["title", "largeFontSize"]);
        const nameAppendQueue = [];

        const nameBold = displayManager.createTextElement(undefined, "span", content.name, ["bold"]);

        if (contentGroup === "rings") {
            nameContainer.style.setProperty("gap", "0.5em");

            const ringSpan = displayManager.createTextElement(undefined, "span", String.fromCharCode(dataManager.content.ui.customIcons[`${contentRef}Icon`]), [contentRef]);
            nameAppendQueue.push(ringSpan);
            nameAppendQueue.push(nameBold);
        }
        // If there is an extra technique name to display, nameContainer will contain an additional span either above or below the main name
        else {
            nameContainer.style.setProperty("flex-direction", "column");

            if (contentGroup === "techniques" && content.extraNames !== undefined) {

                let traditionRef;
                let displayTraditionalName = false;
                if (dataManager.userSettings.latestCharacterName != null) {
                    traditionRef = dataManager.current.character.school.traditionRef;
                    displayTraditionalName = traditionRef !== undefined && Object.keys(content.extraNames).includes(traditionRef);
                }
                
                const displayAbilityOrigin = content.extraNames.abilityOrigin !== undefined;
    
                if (displayTraditionalName || displayAbilityOrigin) {
                    const extraNameSpan = document.createElement("span");
                    if (displayTraditionalName) {
                        extraNameSpan.textContent = content.extraNames[traditionRef] + ` (${dataManager.content.ui.traditionNames[traditionRef]})`;                    
                        nameAppendQueue.push(nameBold);
                        nameAppendQueue.push(extraNameSpan);
                    }
                    if (displayAbilityOrigin) {
                        extraNameSpan.textContent = content.extraNames.abilityOrigin;
                        nameAppendQueue.push(extraNameSpan);
                        nameAppendQueue.push(nameBold);
                    }
                }
            }
        }
        if (!nameAppendQueue.includes(nameBold)) {
            nameAppendQueue.push(nameBold);
        }

        for (const element of nameAppendQueue) {
            nameContainer.appendChild(element);
        }

        if (!noCharacter) {
            const upgradeLine = displayManager.createFlexLineContainer(fragmentAppendQueue, "div", [["justify-content", "center"], ["flex-wrap", "wrap"], ["font-size", "1em"]]);
            displayManager.getUpgradeLine(upgradeLine, content, displayedRing);
        }        

        const stringArrayMap = new Map();

        const stringArrayNames = ["description", "activation", "effects"];
        for (let stringArrayName of stringArrayNames) {
            if (content[stringArrayName] !== undefined) {
                stringArrayMap.set(stringArrayName, content[stringArrayName]);
            }
        }

        if (contentGroup === "skills" && displayedRing !== null) {
            stringArrayMap.set("approachExamples", content.uses[optionalRingRef]);
        }

        // If a roll is involved, add opportunities and maybe stance
        if (contentGroup === "skills" || (contentGroup === "techniques" && content.activationSet.has("tn"))) {
            
            stringArrayMap.set("opportunities", []);

            if (content.newOpportunities !== undefined) {
                stringArrayMap.set("newOpportunities", content.newOpportunities);
            }

            // Make a shallow copy of dataManager.content.rings.any.opportunities.general to leave the original intact after we push strings
            const generalArray = [...dataManager.content.rings.any.opportunities.general];
            stringArrayMap.set("general", generalArray);

            if (displayedRing !== null) {

                if (content.groupRef === "invocation") {
                    stringArrayMap.set("invocation", displayedRing.opportunities.invocation);
                }
                
                for (const string of displayedRing.opportunities.general) {
                    generalArray.push(string);
                }

                if (contentGroup === "skills") {
                    displayManager.createTextElement(nameContainer, "span", `${displayedRing.approachNames[content.groupRef]} (${displayedRing.name})`);

                    if (!content.groupRef === "martial") {
                        const skillArray = [displayedRing.opportunities.skillGroups[content.groupRef]];
                        stringArrayMap.set("skillGroup", skillArray);
                    }

                    const initiativeSkillRefs = ["sentiment", "meditation", "tactics", "command"];
                    for (const initiativeSkillRef of initiativeSkillRefs) {
                        if (dataManager.content.skills[initiativeSkillRef] === content) {
                            stringArrayMap.set("initiative", [displayedRing.opportunities.initiative]);
                            break;
                        }
                    }
                }

                if (content.groupRef === "martial" || (contentGroup === "techniques" && content.activationSet.has("action"))) {
                    stringArrayMap.set("conflict", displayedRing.opportunities.conflict);
                    if (contentGroup === "techniques") {
                        stringArrayMap.set("stanceEffect", [displayedRing.stanceEffect]);                        
                    }
                }
                
                if (contentGroup === "skills" || content.activationSet.has("downtime")) {
                    stringArrayMap.set("downtime", displayedRing.opportunities.downtime);
                }
            }
        }

        // Go through everything in stringArrayMap and add the corresponding elements
        for (const key of stringArrayMap.keys()) {

            // If stringArrayMap has any of these keys, display the corresponding title
            if (key === "opportunities" || key === "stanceEffect") {
                displayManager.createTextElement(fragmentAppendQueue, "p", dataManager.content.ui.consultTitles[key], ["consultCategory", "bold", "italic", "largeFontSize"]);
            }

            const container = displayManager.createContainer(fragmentAppendQueue, "div");
            if (key === "approachExamples" || key === "newOpportunities" || key === "invocation" || key === "general" || key === "skillGroup" || key === "initiative" || key === "conflict" || key === "downtime") {
                displayManager.createTextElement(container, "p", dataManager.content.ui.consultTitles[key], ["largeFontSize", "bold"]);
            }

            for (let string of stringArrayMap.get(key)) {
                const paragraph = displayManager.createTextElement(container, "p");
                
                // Isolate the icon references and use String.fromCharCode on the corresponding codes, then reconstruct string
                // "|" is being used as an icon delimiter in our JSON files
                if (string.includes("|")) {
                    let parts = string.split("|");
                    string = "";
                    for (let i = 0; i < parts.length; i++) {
                        if (parts[i].includes("Icon")) {
                            string += String.fromCharCode(customIcons[parts[i]]);
                        }
                        else {
                            string += parts[i];
                        }                        
                    }
                }

                // If string includes ":", separate it in two spans after the first ":" and bold the first span
                // Arbitrary limit on bold part length set at 40 to avoid false positives
                const splitPosition = string.search(":") + 1;
                if (splitPosition > 0 && splitPosition < 40) {
                    
                    displayManager.createTextElement(paragraph, "span", string.slice(0, splitPosition), ["bold"]);

                    let normalString = string.slice(splitPosition, string.length);
                    /*
                    FIX OR REMOVE THIS PART. AMONG THE ISSUES: DICEPOSITION IS INCONSISTENT, AND THIS DOESN'T WORK WHEN MARTIAL ART IS NOT SPECIFIED
                    ONLY DO THIS WHEN THERE IS A LOADED CHARACTER
                    if (key === "activation" && displayedRing !== null) {
                        for (const skill of Object.values(dataManager.content.skills)) {
                            if (normalString.includes(skill.name)) {
                                const dicePosition = string.search(skill.name);
                                normalString = normalString.slice(0, dicePosition) + ` ${dataManager.current.ringPairMaps.all.get(displayedRing)} ${String.fromCharCode(customIcons.ringDieIcon)} + ${dataManager.current.skillPairMaps.all.get(skill)} ${String.fromCharCode(customIcons.skillDieIcon)}` + normalString.slice(dicePosition, string.length);
                            }
                        }
                    }
                    */
                    displayManager.createTextElement(paragraph, "span", normalString);
                }
                else {
                    paragraph.textContent = string;
                }
            }
        }

        // Add the new viewer content from the completed fragment
        for (const element of fragmentAppendQueue) {
            fragment.appendChild(element);
        }
        currentOverlay.viewer.appendChild(fragment);
    }

    displayProfile() {

        // Clear the existing elements and create the new fragment
        displayManager.profile.container.innerHTML = " ";

        // Create the fragment that will contain the new elements
        const fragment = document.createDocumentFragment();

        // Create the various elements that will be appended to the fragment        

        const profileGrid = displayManager.createGridContainer(fragment, "div", [["grid-auto-flow", "column"], ["grid-template-rows", "repeat(3, auto)"]]);

        createInfoLine(profileGrid, "name", dataManager.userSettings.latestCharacterName);
        createInfoLine(profileGrid, "clan", dataManager.content.clans[dataManager.current.character.clanRef].name);
        createInfoLine(profileGrid, "family", dataManager.content.families[dataManager.current.character.familyRef].name);
        createStatLine(profileGrid, "honor");
        createStatLine(profileGrid, "glory");
        createStatLine(profileGrid, "status");

        createInfoLine(fragment, "school", dataManager.content.schools[Object.keys(dataManager.current.character.learningLists)[0]].name);

        function createInfoLine(parentElement, propertyName, nameText) {
            const line = displayManager.createFlexLineContainer(parentElement);
            displayManager.createTextElement(line, "span", dataManager.content.ui[propertyName] + dataManager.content.ui.colon, ["bold"]);
            displayManager.createTextElement(line, "span", nameText);
        }

        function createStatLine(parentElement, propertyName) {
            const line = displayManager.createFlexLineContainer(parentElement);
            displayManager.createTextElement(line, "span", dataManager.content.ui[propertyName] + dataManager.content.ui.colon, ["bold"]);
            const textInput = document.createElement("input");
            textInput.type = "text";
            textInput.maxLength = 3;
            textInput.value = dataManager.current.character[propertyName];
            textInput.style.width = "2em";
            line.appendChild(textInput);
            
            textInput.onchange = () => {
                if (!isNaN(textInput.value)) {
                    dataManager.current.character[propertyName] = parseInt(textInput.value);
                    // Display the value as adjusted by the property setter
                    textInput.value = dataManager.current.character[propertyName];
                }
                dataManager.cacheCharacter(dataManager.current.character);
            }
        }
       
        const titleTextMap = new Map();
        let canGetNewTitle = true;
        for (let i = 1; i < Object.keys(dataManager.current.character.learningLists).length; i++) {
            const titleRef = Object.keys(dataManager.current.character.learningLists)[i];
            const title = dataManager.content.titles[titleRef];
            const titleProgress = dataManager.current.institutionProgress.get(titleRef).progressXp;
            const rankUpCost = title.curriculum[0].rankUpCost;
            const rankProgress = Math.min(titleProgress, rankUpCost);
            titleTextMap.set(titleRef, `${title.name} (${rankProgress} / ${title.curriculum[0].rankUpCost})`);
            if (i === Object.keys(dataManager.current.character.learningLists).length - 1 && rankProgress < rankUpCost) {
                canGetNewTitle = false;
            }
        }
        const titleContainer = displayManager.createFlexColumnContainer(fragment);        
        displayManager.createTextElement(titleContainer, "span", dataManager.content.ui.titles + dataManager.content.ui.colon, ["bold"]);
        for (const string of titleTextMap.values()) {
            displayManager.createTextElement(titleContainer, "span", string);
        }
        if (canGetNewTitle) {
            const selectLine = displayManager.createFlexLineContainer(titleContainer);
            const unobtainedTitleRefs = Object.keys(dataManager.content.titles).filter(titleRef => !titleTextMap.has(titleRef));

            if (unobtainedTitleRefs.length > 0) {

                const titleSelect = displayManager.createSelect(selectLine, unobtainedTitleRefs, dataManager.content.titles, "name");

                displayManager.createButton(selectLine, "+", () => {
                    dataManager.current.character.learningLists[titleSelect.value] = [];
                
                    for (const propertyName of ["honor", "glory", "status"]) {

                        const title = dataManager.content.titles[titleSelect.value];
                        const initialValue = dataManager.current.character[propertyName];
                    
                        if (title[propertyName] !== undefined) {
                            const changedValue = initialValue + title[propertyName].change;

                            if (changedValue < title[propertyName].minimum && (title[propertyName].change > 0 || initialValue > title[propertyName].minimum)) {
                                dataManager.current.character[propertyName] = title[propertyName].minimum;
                            }
                            else if (changedValue > title[propertyName].maximum && (title[propertyName].change < 0 || initialValue < title[propertyName].maximum)) {
                                dataManager.current.character[propertyName] = title[propertyName].maximum;
                            }
                            else {
                                dataManager.current.character[propertyName] = changedValue;
                            }                        
                        }
                    }
                    dataManager.cacheCharacter(dataManager.current.character).then(() => {
                        dataManager.loadOrResetCharacter(dataManager.userSettings.latestCharacterName);
                    });
                });
            }            
        }

        createTextArea(fragment, "appearance");
        createTextArea(fragment, "giri");
        createTextArea(fragment, "ninjō");
        createTextArea(fragment, "relationships");
        createTextArea(fragment, "personality");

        function createTextArea(parentElement, propertName) {
            const container = displayManager.createFlexColumnContainer(parentElement);
            displayManager.createTextElement(container, "span", dataManager.content.ui[propertName] + dataManager.content.ui.colon, ["bold"]);
            //const textInput = displayManager.createTextElement(container, "textarea", dataManager.current.character[propertName]);
            const textInput = document.createElement("textarea");
            container.appendChild(textInput);

            async function changeText() {
                textInput.textContent = dataManager.current.character[propertName];
            }

            changeText().then(() => {
                textInput.style.height = (5 + textInput.scrollHeight)  +"px";
            });
            
            textInput.onchange = () => {
                // FOR SOME REASON THE 2 IS NECESSARY TO PREVENT THE TEXTAREA FROM GROWING OR SHRINKING ON EACH CHANGE
                textInput.style.height = (2 + textInput.scrollHeight) + "px";
                dataManager.current.character[propertName] = textInput.value;
                dataManager.cacheCharacter(dataManager.current.character);
            }
        }

        displayManager.profile.container.appendChild(fragment);
    }

    displayRings() {

        // Clear the existing elements and create the new fragment
        displayManager.rings.container.innerHTML = " ";

        // Create the fragment that will contain the new elements
        const fragment = document.createDocumentFragment();

        // Create the various elements that will be appended to the fragment        

        const ringGrid = displayManager.createContainer(fragment, "div", ["ringGrid"]);

        const divMap = new Map();
        let i = 0;
        const keys = ["focus", "air", "vigilance", "fire", "void", "water", "endurance", "earth", "composure"];
        for (let row = 1; row <= 5; row++) {
            for (let column = 1; column <= 5; column++) {
                if ([1, 3, 5].includes(row) && [1, 3, 5].includes(column)) {

                    const div = displayManager.createContainer(ringGrid);
                    if (row !== 3 && column !== 3) {
                        div.style.setProperty("grid-row-start", row);
                        div.style.setProperty("grid-column-start", column);
                    }
                    
                    divMap.set(keys[i], div);
                    i++;
                }
                else if (dataManager.userSettings.latestCharacterName != null) {
                    if ([2, 3, 4].includes(row) && [2, 3, 4].includes(column)) {
                        continue;
                    }
                    else {
                        const arrowSpan = displayManager.createTextElement(ringGrid, "span", "", ["veryLargeFontSize", ["grid-row-start", row], ["grid-column-start", column]]);
                        if (row === 2 && [1, 5].includes(column)) {
                            arrowSpan.textContent = "⇧";
                        }
                        else if (row === 4 && [1, 5].includes(column)) {
                            arrowSpan.textContent = "⇩";
                        }
                        else if ([1, 5].includes(row) && column === 2) {
                            arrowSpan.textContent = "⇦";
                        }
                        else if ([1, 5].includes(row) && column === 4) {
                            arrowSpan.textContent = "⇨";
                        }
                    }                    
                }
            }
        }
        for (const ringRef of dataManager.individualRingRefs) {

            const ring = dataManager.content.rings[ringRef];
            
            if (ringRef === "void" && dataManager.userSettings.latestCharacterName != null) {
                divMap.get("void").classList.add("columnContainer", "voidDiv");
    
                const ringContainer = displayManager.createContainer(divMap.get("void"));
    
                displayManager.createTextElement(divMap.get("void"), "span", `${dataManager.content.ui.voidPoints + dataManager.content.ui.colon + dataManager.current.character.voidPoints}/${dataManager.current.ringPairMaps.all.get(dataManager.content.rings["void"])}`);
    
                const buttonLine = displayManager.createFlexLineContainer(divMap.get("void"), "div", [["justify-content", "center"]]);
    
                displayManager.createButton(buttonLine, "-", () => dataManager.current.character.changeVoidPoints(-1));
                displayManager.createButton(buttonLine, "+", () => dataManager.current.character.changeVoidPoints(1));
    
                divMap.set("void", ringContainer);
            }

            displayManager.createTextElement(divMap.get(ringRef), "span", String.fromCharCode(dataManager.content.ui.customIcons[`${ringRef}Icon`]), ["largeIcon", ringRef]);
            const ringName = displayManager.createTextElement(divMap.get(ringRef), "span", ring.name, ["largeFontSize"]);
            if (dataManager.userSettings.latestCharacterName == null) {
                ringName.style.setProperty("grid-row", "span 2");
            }
            else {
                displayManager.createTextElement(divMap.get(ringRef), "span", `${dataManager.content.ui.rank} ${dataManager.current.ringPairMaps.all.get(ring)}`);
            }
            
            divMap.get(ringRef).classList.add("ring", "pointer", "selectable");
            divMap.get(ringRef).onclick = () => {
                displayManager.consultContent(divMap.get(ringRef), ringRef, "rings");
            };
        }

        if (dataManager.userSettings.latestCharacterName != null) {

            for (const attributeRef of ["focus", "vigilance"]) {
                divMap.get(attributeRef).textContent = dataManager.content.ui[attributeRef] + dataManager.content.ui.colon + dataManager.current.character[attributeRef];
            }
            for (const attributeRef of ["endurance", "composure"]) {
                let extra;
                if (attributeRef === "endurance") {
                    extra = [dataManager.content.ui.fatigue + dataManager.content.ui.colon, dataManager.current.character.fatigue, "changeFatigue"];
                }
                else {
                    extra = [dataManager.content.ui.strife + dataManager.content.ui.colon, dataManager.current.character.strife, "changeStrife"];
                }
    
                divMap.get(attributeRef).classList.add("columnContainer");
    
                displayManager.createTextElement(divMap.get(attributeRef), "span", extra[0] + " " + extra[1], [["border-bottom", "1px solid black"]]);
                displayManager.createTextElement(divMap.get(attributeRef), "span", dataManager.content.ui[attributeRef] + dataManager.content.ui.colon + dataManager.current.character[attributeRef]);
                
                const buttonLine = displayManager.createFlexLineContainer(divMap.get(attributeRef), "div", [["justify-content", "center"]]);
    
                displayManager.createButton(buttonLine, "-", () => dataManager.current.character[extra[2]](-1));
                displayManager.createButton(buttonLine, "+", () => dataManager.current.character[extra[2]](1));
            }
    
            const buttonContainer = displayManager.createFlexColumnContainer(fragment, "div", [["justify-content", "space-evenly"], ["flex-grow", 1], ["width", "50%"], ["align-self", "center"]]);
    
            displayManager.createButton(buttonContainer, dataManager.content.ui.endScene, () => dataManager.current.character.endScene());
            displayManager.createButton(buttonContainer, dataManager.content.ui.rest, () => dataManager.current.character.rest());
            displayManager.createButton(buttonContainer, dataManager.content.ui.unmask, () => dataManager.current.character.unmask());
        }

        displayManager.rings.container.appendChild(fragment);
    }

    displaySkills() {

        // Get the filter settings and change dataManager.userSettings.values
        const values = dataManager.userSettings.values;
        for (const filterName of ["skillGroupFilter", "skillRankFilter", "skillAvailabilityFilter", "skillCurriculaFilter"]) {
            values[filterName] = document.getElementById(filterName).value;
        }
        // Cache userSettings
        dataManager.cacheUserSettings();

        const availabilityMap = dataManager.current.skillPairMaps[values.skillAvailabilityFilter];        
        let tempArray = [...availabilityMap];
        switch(values.skillCurriculaFilter) {
            case "any":
                break;
            case "excluded":
                tempArray = tempArray.filter(pair => !dataManager.current.skillPairMaps.included.has(pair[0]));
                break;
            case "included":
                tempArray = tempArray.filter(pair => dataManager.current.skillPairMaps.included.has(pair[0]));
                break;
            case "rank":
                tempArray = tempArray.filter(pair => dataManager.current.skillPairMaps.rank.has(pair[0]));
        }
        
        // Additional filtering based on skill group
        const filteredMap = tempArray.filter(pair => {
            const skill = pair[0];
            const skillRank = pair[1];
            if (values.skillGroupFilter !== "any" && skill.groupRef !== values.skillGroupFilter) {
                return false;
            }
            if (values.skillRankFilter !== "any" && skillRank !== parseInt(values.skillRankFilter)) {
                return false;
            }
            return true;
        });

        // ADD A NO RESULT MESSAGE IF NO RESULT, ELSE KEEP GOING

        // Ordering the array by alphabetical order of skill names
        filteredMap.sort(function(pairA, pairB) {
            const skillA = pairA[0];
            const skillB = pairB[0];
            if (skillA.name < skillB.name) {
                return -1;
            }
            else if (skillA.name > skillB.name) {
                return 1;
            }
            else {
                return 0;
            }
        });

        // Clear the list
        displayManager.skills.container.innerHTML = "";        

        // Create the fragment that will contain the new list elements
        const fragment = document.createDocumentFragment();

        // Create li elements to display for each skill, with span elements inside, each with the proper content and classes for styling
        const customIcons = dataManager.content.ui.customIcons;

        // A pair is an array of a skill and its corresponding rank
        for (const pair of filteredMap) {

            const skill = pair[0];
            const skillRank = pair[1];

            const li = displayManager.createFlexLineContainer(fragment, "li", ["pointer", "selectable", "rounded"]);
            li.addEventListener("click", () => {
                displayManager.consultContent(li, skill, "skills", null);
            });

            if (dataManager.userSettings.latestCharacterName != null) {
                displayManager.createTextElement(li, "span", `${skillRank} ${String.fromCharCode(customIcons.skillDieIcon)}`, ["bold"]);
            }
            
            displayManager.createTextElement(li, "span", skill.name, ["grow"]);

            if (skillRank < 5 && dataManager.userSettings.latestCharacterName != null) {
                const curriculaRankContainer = document.createElement("div");

                // If the skill is included in dataManager.current.institutionSkills, add the school rank number or Ⓣ
                for (const institutionRef of Object.keys(dataManager.current.character.learningLists)) {
                    const skillSetArray = dataManager.current.institutionSkills.get(institutionRef);

                    for (let i = 0; i < skillSetArray.length; i++) {
                        if (skillSetArray[i].has(skill)) {

                            const curriculaRank = displayManager.createTextElement(curriculaRankContainer);
                            if (i === dataManager.current.institutionProgress.get(institutionRef).rank - 1) {
                                curriculaRank.classList.add("customColor", "bold");
                            }
                            // If the institution is the school
                            if (institutionRef === Object.keys(dataManager.current.character.learningLists)[0]) {
                                curriculaRank.textContent += String.fromCharCode(`0xe90${i+3}`);
                            }
                            else {
                                curriculaRank.textContent += String.fromCharCode(customIcons.titleIcon);           
                            }
                        }
                    }
                }
                if (curriculaRankContainer.firstChild) {
                    curriculaRankContainer.classList.add("iconGrid");
                    li.appendChild(curriculaRankContainer);
                }
            }

            // If the skill has at least one level learned, it will have the learned style, otherwise it will have the available style
            if (dataManager.userSettings.latestCharacterName != null && dataManager.current.skillPairMaps.learned.has(skill)) {
                li.classList.add("customColor");
            }
            else {
                li.classList.add("available");
            }
        }
        // Create the new list from the completed fragment
        displayManager.skills.container.appendChild(fragment);

        displayManager.skills.container.scrollTop = 0;
    }

    displayTechniques() {

        // Get the filter settings and change dataManager.userSettings.values
        const values = dataManager.userSettings.values;
        for (const filterName of ["techRankFilter", "techGroupFilter", "techActivationFilter", "techRingFilter", "techAvailabilityFilter", "techCurriculaFilter"]) {
            values[filterName] = document.getElementById(filterName).value;
        }
        // Cache userSettings
        dataManager.cacheUserSettings();

        let availabilitySet;
        if (values.techAvailabilityFilter === "all" || dataManager.userSettings.latestCharacterName == null) {
            availabilitySet = new Set(Object.values(dataManager.content.techniques));
            const institutions = Object.values(dataManager.content.schools).concat(Object.values(dataManager.content.titles));
            for (const institution of institutions) {
                if (institution.initialAbility !== undefined) {
                    availabilitySet.add(institution.initialAbility);
                }
                availabilitySet.add(institution.finalAbility);
            }
        }
        else {
            availabilitySet = dataManager.current.techSets[values.techAvailabilityFilter];
        }
        let tempArray = [...availabilitySet];
        if (dataManager.userSettings.latestCharacterName != null) {
            switch(values.techCurriculaFilter) {            
                case "any":
                    break;            
                case "excluded":
                    tempArray = tempArray.filter(x => !dataManager.current.techSets.included.has(x));
                    break;
                case "included":
                    tempArray = tempArray.filter(x => dataManager.current.techSets.included.has(x));
                    break;
                case "rank":
                    tempArray = tempArray.filter(x => dataManager.current.techSets.rank.has(x));
            }
        }        

        // Additional filtering based on rank, group, activation, ring and clan
        const filteredSet = tempArray.filter(tech => {
            if (values.techRankFilter !== "any" && tech.rank !== parseInt(values.techRankFilter)) {
                return false;
            }
            if (values.techGroupFilter !== "any" && tech.groupRef !== values.techGroupFilter) {
                return false;
            }
            if (values.techActivationFilter !== "any" && !tech.activationSet.has(values.techActivationFilter)) {
                return false;
            }
            if (values.techRingFilter !== "any" && tech.ringRef !== values.techRingFilter) {
                return false;
            }
            if (tech.clanRef !== undefined && dataManager.userSettings.latestCharacterName != null && tech.clanRef !== dataManager.current.character.clanRef && values.techAvailabilityFilter !== "all") {
                return false;
            }
            return true;
        });

        // ADD A NO RESULT MESSAGE IF NO RESULT, ELSE KEEP GOING

        // Ordering the array based on rank order, then groups and rings order from the source book, then alphabetical order of names
        const techGroupRefOrder = ["schoolAbility", "kata", "kihō", "invocation", "ritual", "shūji", "mahō", "ninjutsu", "masteryAbility", "titleEffect", "titleAbility"];
        const ringOrder = [null, "air", "earth", "fire", "water", "void"];
        filteredSet.sort(function(techA, techB) {
            if (techA.rank < techB.rank) {
                return -1;
            }
            else if (techA.rank > techB.rank) {
                return 1;
            }
            else {
                if (techGroupRefOrder.indexOf(techA.groupRef) < techGroupRefOrder.indexOf(techB.groupRef)) {
                    return -1;
                }
                else if (techGroupRefOrder.indexOf(techA.groupRef) > techGroupRefOrder.indexOf(techB.groupRef)) {
                    return 1;
                }
                else {
                    if (ringOrder.indexOf(techA.ringRef) < ringOrder.indexOf(techB.ringRef)) {
                        return -1;
                    }
                    else if (ringOrder.indexOf(techA.ringRef) > ringOrder.indexOf(techB.ringRef)) {
                        return 1;
                    }
                    else {
                        if (techA.name < techB.name) {
                            return -1;
                        }
                        else if (techA.name > techB.name) {
                            return 1;
                        }
                        else {
                            return 0;
                        }
                    }
                }
            }
        });

        // Clear the list
        displayManager.techniques.container.innerHTML = "";

        // Create the fragment that will contain the new list elements
        const fragment = document.createDocumentFragment();

        // Create li elements to display for each technique, with span elements inside, each with the proper content and classes for styling
        const customIcons = dataManager.content.ui.customIcons;
        for (const tech of filteredSet) {

            const li = displayManager.createFlexLineContainer(fragment, "li", ["pointer", "selectable", "rounded"]);
            li.addEventListener("click", () => {
                if (li !== displayManager.techniques.last) {
                    if (displayManager.techniques.last !== null) {
                        displayManager.techniques.last.classList.remove("lastSelected");
                    }                    
                    li.classList.add("lastSelected");
                    displayManager.techniques.last = li;
                }                
                displayManager.consultContent(li, tech, "techniques");
            });

            const rankSpan = displayManager.createTextElement(li, "span", "", ["rank"]);
            if (tech.rank < 7) {
                rankSpan.textContent = tech.rank;
            }

            const groupIcon = displayManager.createTextElement(li, "span", "", ["mediumIcon"]);
            if (["kata", "kihō", "invocation", "ritual", "shūji", "mahō", "ninjutsu"].includes(tech.groupRef)) {
                groupIcon.textContent = String.fromCharCode(customIcons[`${tech.groupRef}Icon`]);
            }
            else if (["schoolAbility", "masteryAbility"].includes(tech.groupRef)) {
                groupIcon.textContent = String.fromCharCode(customIcons.schoolIcon);
            }
            else {
                groupIcon.textContent = String.fromCharCode(customIcons.titleIcon);
            }
            
            if (tech.ringRef !== null) {
                displayManager.createTextElement(li, "span", String.fromCharCode(customIcons[`${tech.ringRef}Icon`]), ["mediumIcon", tech.ringRef]);
            }
            
            if (tech.clanRef !== undefined) {
                displayManager.createTextElement(li, "span", String.fromCharCode(customIcons[`${tech.clanRef}Icon`]), ["mediumIcon"]);
            }

            const activationDiv = displayManager.createContainer(li, "div", ["iconGrid"]);
            for (const keyword of tech.activationSet) {
                if (["action", "downtime", "opportunity", "void", "limited", "permanent"].includes(keyword)) {
                    displayManager.createTextElement(activationDiv, "span", String.fromCharCode(customIcons[`${keyword}Icon`]));
                }                
            }

            const name = displayManager.createTextElement(undefined, "span", tech.name);
            
            // If there is an extra name to display, the element with the name class will be a container of 2 spans instead of a single span
            let addedElement;
            const traditionRef = dataManager.current.character.school.traditionRef;
            if (tech.extraNames !== undefined) {

                const displayTraditionalName = traditionRef !== undefined && Object.keys(tech.extraNames).includes(traditionRef);
                const displayAbilityOrigin = tech.extraNames.abilityOrigin !== undefined;

                if (displayTraditionalName || displayAbilityOrigin) {
                    addedElement = document.createElement("div");
                    const extraName = document.createElement("span");
                    if (displayTraditionalName) {
                        extraName.textContent = tech.extraNames[traditionRef];
                        extraName.classList.add("italic");
                        addedElement.appendChild(name);
                        addedElement.appendChild(extraName);
                    }
                    if (displayAbilityOrigin) {
                        extraName.textContent = tech.extraNames.abilityOrigin;
                        extraName.classList.add("customColor");
                        addedElement.appendChild(extraName);
                        addedElement.appendChild(name);                    
                    }                    
                }
                else {
                    addedElement = name;
                }
            }
            else {
                addedElement = name;
            }
            addedElement.classList.add("columnContainer", "grow");
            li.appendChild(addedElement);

            if (!dataManager.current.techSets.learned.has(tech)) {

                const curriculaRankContainer = document.createElement("div");

                // If the technique is included in dataManager.current.institutionTechs, add the school rank number or Ⓣ
                for (const institutionRef of Object.keys(dataManager.current.character.learningLists)) {
                    
                    const ranksArray = dataManager.current.institutionTechs.get(institutionRef);
                    for (let i = 0; i < ranksArray.length; i++) {
                        if (ranksArray[i].has(tech)) {

                            const curriculaRank = displayManager.createTextElement(curriculaRankContainer);
                            if (i === dataManager.current.institutionProgress.get(institutionRef).rank - 1) {
                                curriculaRank.classList.add("customColor", "bold");
                            }

                            if (institutionRef === Object.keys(dataManager.current.character.learningLists)[0]) {
                                curriculaRank.textContent += String.fromCharCode(`0xe90${i+3}`);
                            }
                            else {
                                curriculaRank.textContent += String.fromCharCode(customIcons.titleIcon);
                            }
                        }
                    }
                }
                if (curriculaRankContainer.firstChild) {
                    curriculaRankContainer.classList.add("iconGrid");
                    li.appendChild(curriculaRankContainer);
                }

                // Here the technique has not been learned, but if it is available or incompatible, the added class will allow it to be styled accordingly
                // Compatible is the default style and does not need a class
                if (dataManager.current.techSets.available.has(tech)) {
                    li.classList.add("available");
                }
                else if (!dataManager.current.techSets.compatible.has(tech)) {
                    li.classList.add("incompatible");
                }
            }
            else {
                // If the technique is learned
                li.classList.add("customColor");
            }           

            // Add the completed li to the fragment
            fragment.appendChild(li);
        }
        // Create the new list from the completed fragment
        displayManager.techniques.container.appendChild(fragment);

        displayManager.techniques.container.scrollTop = 0;
    }

    displayTraits() {

        // Get the filter settings and change dataManager.userSettings.values
        const values = dataManager.userSettings.values;
        for (const filterName of ["traitGroupFilter", "traitRingFilter", "traitTypeFilter", "traitAvailabilityFilter"]) {
            values[filterName] = document.getElementById(filterName).value;
        }
        // Cache userSettings
        dataManager.cacheUserSettings();
        
        let availabilityArray = [];
        for (const traitObj of dataManager.current.character.traitData) {
            if (traitObj.ref !== undefined) {
                availabilityArray.push(dataManager.content.traits[traitObj.ref]);
            }
            else {
                availabilityArray.push(traitObj);
            }
        }
        if (values.traitAvailabilityFilter === "all") {
            for (const trait of Object.values(dataManager.content.traits)) {
                if (!availabilityArray.includes(trait)) {
                    availabilityArray.push(trait);
                }
            }
        }

        // Filtering based on group, ring and type
        const filteredSet = availabilityArray.filter(trait => {
            if (values.traitGroupFilter !== "any" && trait.groupRef !== values.traitGroupFilter) {
                return false;
            }            
            if (values.traitRingFilter !== "any" && trait.ringRef !== values.traitRingFilter) {
                return false;
            }
            if (values.traitTypeFilter !== "any" && !trait.typeRefs.includes(values.traitTypeFilter)) {
                return false;
            }
            return true;
        });

        // ADD A NO RESULT MESSAGE IF NO RESULT, ELSE KEEP GOING

        // Ordering the array based on group order, then ring order, then alphabetical order of names
        const traitGroupRefOrder = ["distinction", "passion", "adversity", "anxiety"];
        const ringOrder = [null, "air", "earth", "fire", "water", "void"];
        filteredSet.sort(function(traitA, traitB) {
            if (traitGroupRefOrder.indexOf(traitA.groupRef) < traitGroupRefOrder.indexOf(traitB.groupRef)) {
                return -1;
            }
            else if (traitGroupRefOrder.indexOf(traitA.groupRef) > traitGroupRefOrder.indexOf(traitB.groupRef)) {
                return 1;
            }
            else {
                if (ringOrder.indexOf(traitA.ringRef) < ringOrder.indexOf(traitB.ringRef)) {
                    return -1;
                }
                else if (ringOrder.indexOf(traitA.ringRef) > ringOrder.indexOf(traitB.ringRef)) {
                    return 1;
                }
                else {
                    if (traitA.name < traitB.name) {
                        return -1;
                    }
                    else if (traitA.name > traitB.name) {
                        return 1;
                    }
                    else {
                        return 0;
                    }
                }
            }
        });

        // Clear the list
        displayManager.traits.container.innerHTML = "";

        // Create the fragment that will contain the new list elements
        const fragment = document.createDocumentFragment();

        // Create li elements to display for each trait, with span elements inside, each with the proper content and classes for styling
        const customIcons = dataManager.content.ui.customIcons;
        for (const trait of filteredSet) {

            const li = displayManager.createFlexLineContainer(fragment, "li", ["pointer", "selectable", "rounded"]);
            li.addEventListener("click", () => {
                if (li !== displayManager.traits.last) {
                    if (displayManager.traits.last !== null) {
                        displayManager.traits.last.classList.remove("lastSelected");
                    }                    
                    li.classList.add("lastSelected");
                    displayManager.traits.last = li;
                }                
                displayManager.consultContent(li, trait, "traits");
            });

            if (trait.ringRef !== null) {
                displayManager.createTextElement(li, "span", String.fromCharCode(customIcons[`${trait.ringRef}Icon`]), ["mediumIcon", trait.ringRef]);
            }
            displayManager.createTextElement(li, "span", dataManager.content.ui.traitGroupNames[trait.groupRef]);
            displayManager.createTextElement(li, "span", trait.name, ["grow"]);
        }
        // Create the new list from the completed fragment
        displayManager.traits.container.appendChild(fragment);

        displayManager.traits.container.scrollTop = 0;
    }

    displayProgress() {

        // Clear the existing elements and create the new fragment
        displayManager.progress.container.innerHTML = " ";

        // Create the fragment that will contain the new elements
        const fragment = document.createDocumentFragment();

        // Create the various elements that will be appended to the fragment
        
        displayManager.createTextElement(fragment, "span", "TEMPORARY", ["bold", ["color", "red"]]);
        
        const totalXpLine = displayManager.createFlexLineContainer(fragment);
        displayManager.createTextElement(totalXpLine, "span", "Total XP:", ["bold"]);
        const xpInput = document.createElement("input");
        xpInput.type = "text";
        xpInput.value = dataManager.current.character.receivedXp;
        totalXpLine.appendChild(xpInput);

        const remainingXpLine = displayManager.createFlexLineContainer(fragment);
        displayManager.createTextElement(remainingXpLine, "span", "Remaining XP:", ["bold"]);
        const remainingXp = displayManager.createTextElement(remainingXpLine, "span", dataManager.current.character.receivedXp - dataManager.current.spentXp);
        
        xpInput.onchange = () => {
            dataManager.current.character.receivedXp = xpInput.value;
            dataManager.cacheCharacter(dataManager.current.character);
            remainingXp.textContent = dataManager.current.character.receivedXp - dataManager.current.spentXp;
        };     

        for (let i = 0; i < Object.keys(dataManager.current.character.learningLists).length; i++) {
            const institutionRef = Object.keys(dataManager.current.character.learningLists)[i];

            function displayInstitutionProgress(contentGroup) {

                const institutionContainer = displayManager.createFlexColumnContainer(fragment);                
                const institution = dataManager.content[contentGroup][institutionRef];
                displayManager.createTextElement(institutionContainer, "span", institution.name + dataManager.content.ui.colon, ["bold"]);
                            
                const rankCount = institution.curriculum.length;
                let institutionProgress = dataManager.current.institutionProgress.get(institutionRef).progressXp;                
                const currentRank = dataManager.current.institutionProgress.get(institutionRef).rank;

                for (let j = 0; j < Math.min(currentRank, rankCount); j++) {

                    const rankLine = displayManager.createFlexLineContainer(institutionContainer);

                    if (rankCount > 1) {
                        displayManager.createTextElement(rankLine, "span", `${dataManager.content.ui.rank} ${j + 1}${dataManager.content.ui.colon}`, ["bold"]);
                    }
                    
                    const rankUpCost = institution.curriculum[j].rankUpCost;
                    const rankProgress = Math.min(institutionProgress, rankUpCost);
                    institutionProgress -= rankUpCost;

                    displayManager.createTextElement(rankLine, "span", `${rankProgress} / ${rankUpCost}`);
                }
            }

            if (i === 0) {
                displayInstitutionProgress("schools");
            }
            else {
                displayInstitutionProgress("titles")
            }            
        }

        displayManager.createButton(fragment, "⚠ RESET ALL PROGRESS (IRREVOCABLE) ⚠", () => dataManager.loadOrResetCharacter(), ["bold", ["position", "absolute"], ["top", "90%"]]);

        displayManager.progress.container.appendChild(fragment);
    }

    getUpgradeLine(upgradeLine, content, skillRing) {

        const customIcons = dataManager.content.ui.customIcons;
        
        upgradeLine.innerHTML = "";

        const diceSpan = document.createElement("span");
        const boldSpan = document.createElement("span");
        boldSpan.classList.add("bold");
        const upgradeButton = document.createElement("button");
        upgradeButton.onclick = () => displayManager.confirmUpgrade(upgradeLine, upgradeButton.textContent, content, skillRing, allowedTechGroupRef);
        let allowedTechGroupRef;        

        // If content is a ring
        if (Object.values(dataManager.content.rings).includes(content)) {
            
            diceSpan.textContent = `${dataManager.current.ringPairMaps.all.get(content)} ${String.fromCharCode(customIcons.ringDieIcon)}`;
            upgradeLine.appendChild(diceSpan);            
            
            const rank = dataManager.current.ringPairMaps.all.get(content);
            if (rank < 5) {
                upgradeButton.textContent = dataManager.content.ui.upgradeText.upgradeRing;
            }
            else {
                boldSpan.textContent = "(" + dataManager.content.ui.upgradeText.maxRank + ")";
                upgradeButton.textContent = dataManager.content.ui.upgradeText.ignoreRestriction;
            }
        }

        // If content is a skill
        else if (Object.values(dataManager.content.skills).includes(content)) {

            const rank = dataManager.current.skillPairMaps.all.get(content);
            // We make use of the optional parameter skillRing to also display ring dice, not just skill dice
            let ringDice = "";
            if (skillRing != null) {
                ringDice = `${dataManager.current.ringPairMaps.all.get(skillRing)} ${String.fromCharCode(customIcons.ringDieIcon)} + `;
            }
            diceSpan.textContent = ringDice + `${rank} ${String.fromCharCode(customIcons.skillDieIcon)}`;
            upgradeLine.appendChild(diceSpan);
            
            if (rank === 0) {
                upgradeButton.textContent = dataManager.content.ui.upgradeText.learnSkill;
            }
            else if (rank < 5) {
                upgradeButton.textContent = dataManager.content.ui.upgradeText.upgradeSkill;
            }
            else {
                boldSpan.textContent = "(" + dataManager.content.ui.upgradeText.maxRank + ")";
                upgradeButton.textContent = dataManager.content.ui.upgradeText.ignoreRestriction;
            }
        }

        // If content is a technique
        else if (Object.values(dataManager.content.techniques).includes(content)) {

            if (dataManager.current.techSets.learned.has(content)) {            
                boldSpan.textContent = dataManager.content.ui.upgradeText.learnedTechnique;
                boldSpan.classList.add("customColor");
            }
            else if (dataManager.current.techSets.available.has(content)) {
                upgradeButton.textContent = dataManager.content.ui.upgradeText.learnTechnique;
            }
            else if (!dataManager.current.techSets.compatible.has(content)) {            
                boldSpan.textContent = dataManager.content.ui.upgradeText.incompatibleTechnique;
                if (!["schoolAbility", "masteryAbility", "titleEffect", "titleAbility"].includes(content.groupRef)) {
                    upgradeButton.textContent = dataManager.content.ui.upgradeText.ignoreRestriction;                    
                    allowedTechGroupRef = content.groupRef;
                }
            }
            else {            
                boldSpan.textContent = dataManager.content.ui.upgradeText.unavailableTechnique;
                upgradeButton.textContent = dataManager.content.ui.upgradeText.ignoreRestriction;
            }
        }

        // If content is a trait (could be a custom one)
        else {
            let matchingObjectIndex = null;
            for (let i = 0; i < dataManager.current.character.traitData.length; i++) {
                const traitObj = dataManager.current.character.traitData[i];
                if ((traitObj.ref === undefined && traitObj.name === content.name) || dataManager.content.traits[traitObj.ref] === content) {
                    matchingObjectIndex = i;
                    break;
                }
            }

            // THE FOLLOWING DOESN'T ACCOUNT FOR THE POSSIBILITY OF MULTIPLE VERSIONS OF THE SAME TRAIT
            if (matchingObjectIndex === null) {                
                let newTraitRef = null;
                for (const traitRef of Object.keys(dataManager.content.traits)) {
                    if (dataManager.content.traits[traitRef] === content) {
                        newTraitRef = traitRef;
                        break;
                    }
                }
                if (newTraitRef !== null) {
                    upgradeButton.textContent = dataManager.content.ui.upgradeText.addTrait;
                    upgradeButton.onclick = () => {
                        dataManager.current.character.traitData.push({ref: newTraitRef});
                        updateTraits();
                    };
                }
            }
            else {
                upgradeButton.textContent = dataManager.content.ui.upgradeText.removeTrait;
                upgradeButton.onclick = () => {
                    dataManager.current.character.traitData.splice(matchingObjectIndex, 1);
                    updateTraits();
                };
            }

            function updateTraits() {
                dataManager.cacheCharacter(dataManager.current.character);
                displayManager.clearContent();
                displayManager.displayTraits();
                displayManager.getUpgradeLine(upgradeLine, content);
            }
        }

        if (diceSpan.textContent.length > 0) {
            upgradeLine.appendChild(diceSpan);
        }
        if (boldSpan.textContent.length > 0) {
            upgradeLine.appendChild(boldSpan);
        }
        if (upgradeButton.textContent.length > 0) {
            upgradeLine.appendChild(upgradeButton);
        }
    }

    // INCLUDE IN GETUPGRADELINE IF NOT USED ANYWHERE ELSE
    confirmUpgrade(upgradeLine, buttonText, content, skillRing, allowedTechGroupRef) {

        // The parameter skillRing is only used to update upgradeLine for skills
        // The parameter allowedTechGroupRef is only used when learning a restricted technique group

        const currentOverlay = displayManager.openViewer(displayManager.overlays.styles.confirm, upgradeLine);        

        // Create the fragment that will contain the new viewer elements
        const fragment = document.createDocumentFragment();

        // Create the cost line
        const costLine = displayManager.createFlexLineContainer(fragment);

        displayManager.createTextElement(costLine, "span", `${buttonText} ${dataManager.content.ui.upgradeText.for}`);

        const costSelect = document.createElement("select");
        const costArray = [dataManager.getUpgradeCost(content), 0];
        for (const cost of costArray) {
            const option = document.createElement("option");
            option.value = cost;
            option.text = cost + " XP";
            costSelect.options.add(option);
        }
        costLine.appendChild(costSelect);

        const curriculumProgressContainer = displayManager.createFlexColumnContainer(fragment, "div", [["align-items", "center"], ["text-align", "center"], ["gap", "0.5em"]]);
        const forcedCurriculumLine = displayManager.createContainer(fragment, "div", [["display", "none"], ["align-items", "center"], ["gap", "0.5em"]]);

        let extraLetter = null;
        let selectedInstitutionRef = null;
        displayCurriculumProgress();
        
        costSelect.onchange = () => {
            displayCurriculumProgress();
        }

        currentOverlay.viewer.appendChild(fragment);

        function displayCurriculumProgress() {
        
            curriculumProgressContainer.innerHTML = "";
            forcedCurriculumLine.innerHTML = "";
    
            if (costSelect.value > 0) {

                if (dataManager.current.character.receivedXp - dataManager.current.spentXp < costSelect.value) {
                    displayManager.createTextElement(curriculumProgressContainer, "span", dataManager.content.ui.upgradeText.notEnoughXp, ["bold"]);
                    return;
                }

                const fullProgressMap = new Map();
                const halfProgressMap = new Map();

                let techniqueGroupRefs;
                for (const institutionRef of Object.keys(dataManager.current.character.learningLists)) {
    
                    let institution;            
                    // Find the right institution object in dataManager.content
                    if (institutionRef === Object.keys(dataManager.current.character.learningLists)[0]) {
                        institution = dataManager.content.schools[institutionRef];
                        techniqueGroupRefs = institution.techniqueGroupRefs;
                    }
                    else {
                        institution = dataManager.content.titles[institutionRef];
                    }            
                    const institutionProgress = dataManager.current.institutionProgress.get(institutionRef);
                    const rankSkills = dataManager.current.institutionSkills.get(institutionRef)[institutionProgress.rank - 1];
                    const rankTechs = dataManager.current.institutionTechs.get(institutionRef)[institutionProgress.rank - 1];

                    if ((rankSkills !== undefined && rankSkills.has(content)) || (rankTechs !== undefined && rankTechs.has(content))) {
                        fullProgressMap.set(institutionRef, [institution.name, costSelect.value]);
                    }
                    else if ((!Object.values(dataManager.content.techniques).includes(content) || techniqueGroupRefs.includes(content.groupRef) || content.groupRef === allowedTechGroupRef) && institutionProgress.rank <= institution.curriculum.length) {
                        halfProgressMap.set(institutionRef, [institution.name, costSelect.value/2]);
                    }
                }
    
                const orderedMap = new Map([...fullProgressMap, ...halfProgressMap]);
                if (orderedMap.size > 0) {
    
                    displayManager.createTextElement(curriculumProgressContainer, "span", dataManager.content.ui.upgradeText.progress + dataManager.content.ui.colon);

                    const institutionLine = displayManager.createFlexLineContainer(curriculumProgressContainer);

                    const institutionSpan = document.createElement("span");
                    const institutionSelect = document.createElement("select");
                    selectedInstitutionRef = [...orderedMap.keys()][0];

                    if(orderedMap.size === 1) {                        
                        institutionSpan.textContent = `${orderedMap.get(selectedInstitutionRef)[0]} (${orderedMap.get(selectedInstitutionRef)[1]} XP)`;
                        institutionLine.appendChild(institutionSpan);
                    }
                    else {                        
                        for (const institutionRef of orderedMap.keys()) {
                            const option = document.createElement("option");
                            option.value = institutionRef;
                            institutionSelect.options.add(option);
                        }
                        institutionLine.appendChild(institutionSelect);
    
                        institutionSelect.onchange = () => {
                            selectedInstitutionRef = institutionSelect.value;
                            displayForcedCurriculumLine();
                        }
                    }
                    displayForcedCurriculumLine();

                    function displayForcedCurriculumLine() {

                        for (const option of institutionSelect.options) {
                            option.text = `${orderedMap.get(option.value)[0]} (${orderedMap.get(option.value)[1]} XP)`
                        }

                        forcedCurriculumLine.innerHTML = "";
                        
                        if (halfProgressMap.has(selectedInstitutionRef)) {
                            forcedCurriculumLine.style.setProperty("display", "flex");

                            const checkbox = displayManager.createCheckbox(forcedCurriculumLine, changeExtraLetter);
                            changeExtraLetter();
                
                            displayManager.createTextElement(forcedCurriculumLine, "span", dataManager.content.ui.upgradeText.forceContribution);
                            
                            function changeExtraLetter() {
                                let contribution;
                                if (checkbox.checked) {
                                    extraLetter = "C";
                                    contribution = costSelect.value;
                                }
                                else {
                                    extraLetter = null;
                                    contribution = costSelect.value/2;
                                }

                                if(orderedMap.size === 1) {
                                    institutionSpan.textContent = `${orderedMap.get(selectedInstitutionRef)[0]} (${contribution} XP)`;
                                }
                                else {
                                    for (const option of institutionSelect.options) {
                                        if (option.value === institutionSelect.value) {
                                            option.text = `${orderedMap.get(option.value)[0]} (${contribution} XP)`
                                        }
                                        else {
                                            option.text = `${orderedMap.get(option.value)[0]} (${orderedMap.get(option.value)[1]} XP)`
                                        }
                                    }
                                }
                            }
                        }
                        else {
                            forcedCurriculumLine.style.setProperty("display", "none");
                        }
                    }
                }
            }
            else {
                curriculumProgressContainer.textContent = dataManager.content.ui.upgradeText.free;
                extraLetter = "F";
            }

            displayManager.createButton(curriculumProgressContainer, dataManager.content.ui.upgradeText.confirm, () => {
                displayManager.learnContent(upgradeLine, content, skillRing, selectedInstitutionRef, extraLetter);
                displayManager.hideOverlay(currentOverlay);
            });
        }
    } 

    // INCLUDE IN confirmUpgrade IF NOT USED ANYWHERE ELSE
    learnContent(upgradeLine, content, skillRing, selectedInstitutionRef, extraLetter) {

        let letter;        
        let displayFunction;
        let contentRef;
        if (Object.values(dataManager.content.rings).includes(content)) {
            letter = "R";
            displayFunction = displayManager.displayRings;
            for (const ringRef of dataManager.individualRingRefs) {
                if (dataManager.content.rings[ringRef] === content) {
                    contentRef = ringRef;
                }
            }
        }
        else if (Object.values(dataManager.content.skills).includes(content)) {
            letter = "S";
            displayFunction = displayManager.displaySkills;
            for (const skillRef of Object.keys(dataManager.content.skills)) {
                if (dataManager.content.skills[skillRef] === content) {
                    contentRef = skillRef;
                }
            }
        }
        else {
            letter = "T";
            displayFunction = displayManager.displayTechniques;
            for (const techRef of Object.keys(dataManager.content.techniques)) {
                if (dataManager.content.techniques[techRef] === content) {
                    contentRef = techRef;
                }
            }
        }

        let prefixRefString = "";
        if (extraLetter !== null) {
            prefixRefString = extraLetter;
        }        
        prefixRefString += `${letter}: ${contentRef}`;                
                
        const newLearningLists = {};
        for (const institutionRef of Object.keys(dataManager.current.character.learningLists)) {
            newLearningLists[institutionRef] = [];
        }
        newLearningLists[selectedInstitutionRef] = [prefixRefString];
        dataManager.updateFilteredCollections(newLearningLists);
        
        dataManager.current.character.learningLists[selectedInstitutionRef].push(prefixRefString);
        dataManager.cacheCharacter(dataManager.current.character);

        displayManager.clearContent();
        displayFunction();
                
        displayManager.getUpgradeLine(upgradeLine, content, skillRing);
    }

    updateLayout(character) { 
        
        /*
        const optionalElements = document.getElementsByClassName("optional");

        if (character != null) {
            for (const element of optionalElements) {
                element.style.setProperty("display", "inline");
            }
            */

            const clanColors = new Map();
            clanColors.set("crab", `hsl(220, 40%, 60%)`);
            clanColors.set("crane",`hsl(195, 60%, 60%)`);
            clanColors.set("dragon",`hsl(140, 40%, 50%)`);
            clanColors.set("lion",`hsl(45, 70%, 50%)`);
            clanColors.set("phoenix",`hsl(30, 80%, 60%)`);
            clanColors.set("scorpion",`hsl(0, 60%, 50%)`);
            clanColors.set("unicorn",`hsl(290, 40%, 60%)`);

            document.querySelector(":root").style.setProperty("--customColor", clanColors.get(character.clanRef));
            document.getElementById("clanIcon").textContent = String.fromCharCode(dataManager.content.ui.customIcons[`${character.clanRef}Icon`]);
            document.getElementById("name").textContent = dataManager.userSettings.latestCharacterName;
            document.getElementById("school").textContent = dataManager.content.schools[Object.keys(character.learningLists)[0]].name;
        /*    
        }
        else {
            for (const element of optionalElements) {
                element.style.setProperty("display", "none");
            }

            document.querySelector(":root").style.setProperty("--customColor", "grey");                    
            document.getElementById("clanIcon").textContent = "";
        }
        */
    }
}

class Character {
    constructor(personalName, clanRef, familyRef, schoolRef, appearance, giri, ninjō, relationships, personality, traitData, startingRingsObj, startingSkillsObj, startingTechRefs, equipmentData, honor, glory, status) {
        
        this.personalName = personalName; // String
        this.clanRef = clanRef; // String
        this.familyRef = familyRef; // String
        this.appearance = appearance; // String
        this.learningLists = {}; // Object with schoolRef and titleRefs as properties, each containing an arrays of strings, with prefixes for each refString
        this.learningLists[schoolRef] = [];
        this.giri = giri; // String
        this.ninjō = ninjō; // String
        this.relationships = relationships; // String
        this.personality = personality; // Strings
        this.traitData = traitData; // Array of objects with a ref property, or trait object properties
        this.startingRingsObj = startingRingsObj; // Object with "air", "earth", "fire", "water" and "void" as properties, and int values
        this.startingSkillsObj = startingSkillsObj; // Object with skillRef keys and int values
        this.startingTechRefs = startingTechRefs; // Array of strings
        this.equipmentData = equipmentData; // Array of objects with an equipmentRef property, an amount property, and optional equipment object properties (override)
        this.receivedXp = 0; // Int

        this._honor = honor; // Int
        this._glory = glory; // Int
        this._status = status; // Int
        this._fatigue = 0; // Int
        this._strife = 0; // Int
        if (startingRingsObj !== undefined) {
            this._voidPoints = Math.ceil(startingRingsObj["void"]/2); // Int
        }
    }

    get school() {return dataManager.content.schools[Object.keys(this.learningLists)[0]]}

    get honor() {return this._honor;}
    set honor(value) {this._honor = Math.min(Math.max(0, value), 100);}

    get glory() {return this._glory;}
    set glory(value) {this._glory = Math.min(Math.max(0, value), 100);}

    get status() {return this._status;}
    set status(value) {this._status = Math.min(Math.max(0, value), 100);}

    get fatigue() {return this._fatigue;}
    changeFatigue(difference) {
        this._fatigue = Math.max(0, this._fatigue += difference);
        displayManager.displayRings();
        dataManager.cacheCharacter(dataManager.current.character);
    }

    get strife() {return this._strife;}
    changeStrife(difference) {
        this._strife = Math.max(0, this._strife += difference);
        displayManager.displayRings();
        dataManager.cacheCharacter(dataManager.current.character);
    }

    get voidPoints() {return this._voidPoints;}
    changeVoidPoints(difference) {
        this._voidPoints = Math.min(Math.max(0, this._voidPoints += difference), dataManager.current.ringPairMaps.all.get(dataManager.content.rings.void));
        displayManager.displayRings();
        dataManager.cacheCharacter(dataManager.current.character);
    }

    get endurance() {return (dataManager.current.ringPairMaps.all.get(dataManager.content.rings["earth"]) + dataManager.current.ringPairMaps.all.get(dataManager.content.rings["fire"])) * 2;}
    get composure() {return (dataManager.current.ringPairMaps.all.get(dataManager.content.rings["earth"]) + dataManager.current.ringPairMaps.all.get(dataManager.content.rings["water"])) * 2;}
    get focus() {return dataManager.current.ringPairMaps.all.get(dataManager.content.rings["fire"]) + dataManager.current.ringPairMaps.all.get(dataManager.content.rings["air"]);}
    get vigilance() {return Math.floor((dataManager.current.ringPairMaps.all.get(dataManager.content.rings["air"]) + dataManager.current.ringPairMaps.all.get(dataManager.content.rings["water"]))/2);}

    endScene() {
        this._fatigue = Math.ceil(Math.min(this._fatigue, this.endurance/2));
        this._strife = Math.ceil(Math.min(this._strife, this.composure/2));
        displayManager.displayRings();
        dataManager.cacheCharacter(dataManager.current.character);
    }
    // The rest function also applies the effects of endScene before the full night's rest
    rest() {
        this._fatigue = Math.ceil(Math.min(this._fatigue, this.endurance/2));
        this._strife = Math.ceil(Math.min(this._strife, this.composure/2));
        this._fatigue = Math.max(0, this._fatigue - 2 * dataManager.current.ringPairMaps.all.get(dataManager.content.rings["water"]));
        displayManager.displayRings();
        dataManager.cacheCharacter(dataManager.current.character);
    }
    unmask() {
        this._strife = 0;
        displayManager.displayRings();
        dataManager.cacheCharacter(dataManager.current.character);
    }

    // CREATE A METHOD TO ADD TITLES
}

// #endregion ----------------------------------------------------------------------------------------------------

// #region Execution order ----------------------------------------------------------------------------------------------------

// Create a dataManager singleton
const dataManager = new DataManager();
// Create a displayManager singleton
const displayManager = new DisplayManager(); 
displayManager.overlays.primary.viewer.addEventListener("animationend", () => {displayManager.toggleOverlayVisibility(displayManager.overlays.primary)});
displayManager.overlays.secondary.viewer.addEventListener("animationend", () => {displayManager.toggleOverlayVisibility(displayManager.overlays.secondary)});


// JSON caching and content object creation are done through dataManager.initialize() as an async process
dataManager.initialize().then(() => {

    displayManager.initialize(false);

    // TEMPORARY TESTING, LOADTAB IS USED AT THE END OF BOTH FUNCTIONS
    if (dataManager.userSettings.latestCharacterName !== undefined) {
        dataManager.loadOrResetCharacter(dataManager.userSettings.latestCharacterName);
    }

    document.getElementById("language").onchange = dataManager.changeLanguage;    

    document.getElementById("skillGroupFilter").onchange = displayManager.displaySkills;
    document.getElementById("skillRankFilter").onchange = displayManager.displaySkills;
    document.getElementById("skillAvailabilityFilter").onchange = displayManager.displaySkills;
    document.getElementById("skillCurriculaFilter").onchange = displayManager.displaySkills;

    document.getElementById("techRankFilter").onchange = displayManager.displayTechniques;
    document.getElementById("techGroupFilter").onchange = displayManager.displayTechniques;
    document.getElementById("techActivationFilter").onchange = displayManager.displayTechniques;
    document.getElementById("techRingFilter").onchange = displayManager.displayTechniques;
    document.getElementById("techAvailabilityFilter").onchange = displayManager.displayTechniques;
    document.getElementById("techCurriculaFilter").onchange = displayManager.displayTechniques;

    document.getElementById("traitGroupFilter").onchange = displayManager.displayTraits;
    document.getElementById("traitRingFilter").onchange = displayManager.displayTraits;
    document.getElementById("traitTypeFilter").onchange = displayManager.displayTraits;
    document.getElementById("traitAvailabilityFilter").onchange = displayManager.displayTraits;
});

// #endregion ----------------------------------------------------------------------------------------------------
