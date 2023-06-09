"use strict";

// #region Class definitions ----------------------------------------------------------------------------------------------------

class UserSettings {
    constructor(languages) {
        
        this.tempCharacterName = undefined;

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
            // IF CHARACTER DETECTED IN CACHE, SET TAB TO CHOOSE CHARACTER, OTHERWISE CREATE CHARACTER
            currentTabClass: "techniques",
            skillGroupFilter: undefined,
            skillRankFilter: undefined,
            skillAvailabilityFilter: undefined,
            skillCurriculaFilter: undefined,
            techRankFilter: undefined,
            techTypeFilter: undefined,
            techActivationFilter: undefined,
            techRingFilter: undefined,
            techAvailabilityFilter: undefined,
            techCurriculaFilterFilter: undefined
        }        
    }
}

class DataManager {
    static cacheName = "L5R_app";

     // For each language + base, the JSON file with a matching name will be cached for each of the following content types.
    static contentTypes = ["clans", "families", "schools", "rings", "skills", "skillGroups", "techniques", "techniqueTypes", "titles", "traditions", "ui"];

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

        // this.characterNames will store the names of all loadable characters in an array
        this.characterNames = undefined;
        
        // this.loaded is a container for the loaded character, as well as data derived from it and from this.content
        this.loaded = {
            character: undefined,
            school: undefined,
            titles: undefined, // Set of titles
            institutionRanks: undefined,
            institutionRankSkills: undefined,
            institutionRankTechs: undefined,            
            ringMaps: { // Maps of [ring, int]
                all: undefined, 
                upgradable: undefined
            },
            skillMaps: { // Maps of [skill, int]
                all: undefined,
                learned: undefined, 
                upgradable: undefined,
                included: undefined,
                current: undefined
            },
            techSets: { // Sets of techniqueRefs
                learned: undefined,
                compatible: undefined,
                available: undefined,
                missable: undefined,
                included: undefined,
                current: undefined
            },
            remainingExp: undefined
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
            // Set language options for languageSelect (this part is unaffected by the chosen language, so we can set this here instead of contentManager)
            for (const language of dataManager.contentInfo.languages) {
                const option = document.createElement("option");
                option.value = language;
                option.text = language;
                document.getElementById("languageSelect").options.add(option);
                document.getElementById("languageSelect").value = dataManager.userSettings.language;
            }

            // Get dataManager.characterNames
            dataManager.characterNames = await dataManager.getCharacterNames(cache);

            if (dataManager.contentInfo.lastContentUpdate === undefined || dataManager.userSettings.lastCacheTime === undefined || new Date(dataManager.contentInfo.lastContentUpdate).getTime() > dataManager.userSettings.lastCacheTime) {

                dataManager.userSettings.lastCacheTime = Date.now();

                // Create an array of all content directory paths
                const paths = [`./content/base`];

                for (const language of dataManager.contentInfo.languages) {
                    paths.push(`./content/${language}`);
                };
      
                // Create an array of urls for all content files
                const urls = [];
                for (const contentType of DataManager.contentTypes) {
                    for (const path of paths) {
                        urls.push(`${path}/${contentType}.json`);
                    };            
                };

                // Cache all JSON files from all languages
                await cache.addAll(urls);
            }

            // Complete the content properties by merging data from base and english directories by default, overwriting english data if necessary, then finalizing abilities
            await dataManager.getContent(cache, `./content/base`);
            await dataManager.getContent(cache, `./content/${dataManager.contentInfo.languages[0]}`);
            if (dataManager.userSettings.language !== dataManager.contentInfo.languages[0]) {
                await dataManager.getContent(cache, `./content/${dataManager.userSettings.language}`);
            }
            dataManager.finalizeTechsAndAbilities();

            // MAKE IT POSSIBLE TO HAVE ONE FILE MISSING
        }
        else {
            // ERROR MESSAGE, CLOSE APPLICATION? <<<<<<<<<<<<<<<
        }
    }

    async cacheUserSettings() {
        const cache = await caches.open(DataManager.cacheName);
        await cache.put("userSettings.json", new Response(JSON.stringify(dataManager.userSettings)));
    }

    async getContentInfo(cache) {
        const response = await cache.match(`./content/contentInfo.json`);
        if (response) {
            const contentInfo = await response.json();
            return contentInfo;
        }   
    }

    async getUserSettings(cache, languages) {
        // If userSettings.json exists in the cache, assign the corresponding object to dataManager.userSettings, otherwise create a new UserSettings
        const response = await cache.match(`./userSettings.json`);
        if (response) {
            const userSettings = await response.json();
            if (!languages.includes(userSettings.language)) {
                userSettings.language = new UserSettings(languages).language;
            }
            return userSettings;
        }
        else {
            return new UserSettings(languages);
        }
    }

    async cacheCharacter() {
        // Cache the loaded character in /characters, in the form of familyName_givenName.json
        const cache = await caches.open(DataManager.cacheName);
        await cache.put(`./characters/${dataManager.content.families[dataManager.loaded.character.familyRef].name}_${dataManager.loaded.character.givenName}.json`, new Response(JSON.stringify(dataManager.loaded.character)));        
    }

    async getCharacterNames(cache) {
        const names = [];
        const cacheKeys = await cache.keys();
        for (const cacheKey of cacheKeys) {
            // for each JSON file in the cache, check if it is in /characters
            if (cacheKey.url.includes("/characters/")) {
                // If so, get the character's name from the file name and push it to the names array
                const nameStartPosition = cacheKey.url.search("/characters/") + "/characters/".length;
                const characterName = cacheKey.url.slice(nameStartPosition, -5).replace("_", " ");
                names.push(characterName);
            }
        };
        return names;
        
        /* DELETE IF NO PROBLEM WITH THE NEW VERSION
        const names = [];
        await cache.keys().then(requests => {
            for (const request of requests) {
                // for each JSON file in the cache, check if it is in /characters
                if (request.url.includes("/characters/")) {
                    // If so, get the character's name from the file name and push it to the names array
                    const nameStartPosition = request.url.search("/characters/") + "/characters/".length;
                    const characterName = request.url.slice(nameStartPosition, -5).replace("_", " ");
                    names.push(characterName);
                }
            };
        });
        return names;
        */
    }

    async loadCharacter(characterName) {
        const cache = await caches.open(DataManager.cacheName);
        // Get the file name from the character's name and try to find it in the cache
        const jsonName = `${characterName}.json`.replace(" ","_"); 
        const response = await cache.match(`./characters/${jsonName}`);
        // If the json file exists in the cache, assign the corresponding object to dataManager.loaded.character
        if (response) {
            const jsonObject = await response.json();
            dataManager.loaded.character = Object.assign(new Character(), jsonObject);
            dataManager.updateFilteredSets(jsonObject);
        }
        else {
            dataManager.loaded = null;
            // RESET DISPLAY?
        }
        contentManager.loadTab();
        // TEMPORARY! THE FOLLOWING ONLY WORKS BECAUSE FOR TEMP CHARACTER, SCHOOLREF === FAMILYREF
        contentManager.updateCharacterHeader(dataManager.loaded.character.familyRef, dataManager.loaded.character.clanRef);
    }

    async getContent(cache, directoryPath) {
        const promises = DataManager.contentTypes.map(async contentType => {
            // For each content type, get an object from the corresponding file in directoryPath
            const response = await cache.match(`${directoryPath}/${contentType}.json`);
            const jsonObject = await response.json();
            // Combine the content that is already stored for this contentType with the data from jsonObject
            if (dataManager.content[contentType] === undefined) {
                dataManager.content[contentType] = {};
            }
            dataManager.combineContent(dataManager.content[contentType], jsonObject);
        });      
        await Promise.all(promises);
    }

    combineContent(object, newObject) {
        if (Object.keys(object).length > 0) {
            for (const propertyName of Object.keys(newObject)) {   
                // If the property exists and is an object, repeat the process for this object             
                if (object[propertyName] !== undefined && typeof object[propertyName] === "object") {
                    dataManager.combineContent(object[propertyName], newObject[propertyName]);
                }
                // Otherwise, create it or replace it with the new value
                else {
                    object[propertyName] = newObject[propertyName];
                }
            };
        }
        // If content doesn't exist for this contentType, store the corresponding object as a content property
        else {
            Object.assign(object, newObject);
        }
    }

    finalizeTechsAndAbilities() {
        // Make a shallow copy of Object.values(dataManager.content.techniques) that will be used to check for ringRef
        const completeArray = [...Object.values(dataManager.content.techniques)];

        for (const school of Object.values(dataManager.content.schools)) { 
            const abilityArray = [];

            school.initialAbility.typeRef = "school ability";
            school.initialAbility.rank = 1;
            abilityArray.push(school.initialAbility);

            school.finalAbility.typeRef = "mastery ability";
            school.finalAbility.rank = 6;
            abilityArray.push(school.finalAbility);

            for (const ability of abilityArray) {
                ability.extraNames = {abilityOrigin: school.name};
                completeArray.push(ability);
            }
        }
        for (const title of Object.values(dataManager.content.titles)) {
            const abilityArray = [];

            // The ranks are set to 7 to place these abilities at the end of the list, but the number will not be displayed
            if (title.initialAbility !== undefined) {                
                title.initialAbility.rank = 7;                
                title.initialAbility.typeRef = "title effect";              
                // Because there is no name, use the type instead
                title.initialAbility.name = dataManager.content.techniqueTypes[title.initialAbility.typeRef].name;
                abilityArray.push(title.initialAbility);
            }
            title.finalAbility.rank = 7;
            title.finalAbility.typeRef = "title ability";
            abilityArray.push(title.finalAbility);

            for (const ability of abilityArray) {
                ability.extraNames = {abilityOrigin: title.name};
                completeArray.push(ability);
            }
        }
        const keywords = dataManager.content.ui.activationKeywords;
        for (const techOrAbility of completeArray) {

            const checkedString = techOrAbility.activation[0].toLowerCase();

            if (techOrAbility.ringRef === undefined) {
                techOrAbility.ringRef = "none";
                // The first property ("any") of dataManager.content.rings is not used
                let foundRing = false;
                for (const ringRef of Object.keys(dataManager.content.rings).splice(1, 5)) {
                    if (checkedString.includes(`(${dataManager.content.rings[ringRef].name.toLowerCase()})`)) {
                        techOrAbility.ringRef = ringRef;
                        foundRing = true;
                        break;
                    }
                }
                if (!foundRing) {
                    ringLoop:
                    for (const ringRef of Object.keys(dataManager.content.rings).splice(1, 5)) {
                        for (const ringKeyword of keywords.ring) {
                            if (checkedString.includes(ringKeyword) && checkedString.includes(dataManager.content.rings[ringRef].name.toLowerCase())) {
                                techOrAbility.ringRef = ringRef;
                                break ringLoop;
                            }
                        }                        
                    }
                }
            }

            techOrAbility.activationSet = new Set();

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
                    const groupRefs = [];
                    for (const skill of Object.values(dataManager.content.skills)) {
                        if (checkedString.includes(skill.name.toLowerCase())) {
                            groupRefs.push(skill.groupRef);
                        }
                    }
                    if (groupRefs.length === 0) {
                        for (const groupRef of Object.keys(dataManager.content.skillGroups)) {
                            const skillGroup = dataManager.content.skillGroups[groupRef];
                            if (checkedString.includes(skillGroup.name.toLowerCase()) || checkedString.includes(skillGroup.skillType.toLowerCase())) {
                                groupRefs.push(groupRef);
                            }
                        }
                    }                    
                    for (const groupRef of groupRefs) {
                        techOrAbility.activationSet.add(groupRef);
                    }
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
    
    async changeLanguage() {
        const cache = await caches.open(DataManager.cacheName);
        dataManager.userSettings.language = document.getElementById("languageSelect").value;
        dataManager.cacheUserSettings();
        await dataManager.getContent(cache, `./content/${dataManager.userSettings.language}`);
        dataManager.finalizeTechsAndAbilities();
        contentManager.initialize(true);
        contentManager.clearContent();
        contentManager.loadTab(dataManager.userSettings.currentTabClass);
        
        // Change the page language to reflect userSettings
        document.documentElement.lang = dataManager.userSettings.language;
    }

    updateFilteredSets(character) {
        // MAKE A DIFFERENT FUNCTION FOR LEARNING SKILLS/TECHS, RANK UPS, NEW TITLES
        // institutionRankSkills AND institutionRankTechs ONLY CHANGE WHEN A TITLE IS ADDED, SO THEY SHOULD BE REUSED INSTEAD OF REMADE

        // The following sets and maps used will be used to update filtered sets down the line
        
        const ringsLearned = new Map(); // Map of [ring, int]
        for (const ringRef of Object.keys(character.startingRingRefs)) {
            ringsLearned.set(dataManager.content.rings[ringRef], character.startingRingRefs[ringRef]);
        }

        const skillsLearned = new Map(); // Map of [skill, int]
        for (const skillRef of Object.keys(character.startingSkillRefs)) {
            skillsLearned.set(dataManager.content.skills[skillRef], character.startingSkillRefs[skillRef]);
        }

        const techsLearned = new Set(); // Set of techniques
        for (const techRef of character.startingTechniqueRefs) {
            techsLearned.add(dataManager.content.techniques[techRef]);
        }

        // Variables used to get the above

        const ringCostPerRank = 3;
        const skillCostPerRank = 2;
        const defaultTechCost = 3;

        dataManager.loaded.titles = new Set();
        
        // An institution could be the school or a title
        const progressLists = new Map(); // Map of (institution, [string])

        const spentExp = new Map();
        const progressExp = new Map();
        // The Map institutionRanks will contain contain pairs of (institution, int), where int is the institution rank based on progressExp
        dataManager.loaded.institutionRanks = new Map();

        // The Maps institutionRankSkills and institutionRankTechs will contain arrays for each institution, with each array containing a Set of skills or techniques for each rank
        dataManager.loaded.institutionRankSkills = new Map();
        dataManager.loaded.institutionRankTechs = new Map();
        
        // Set pairs for institutionRankSkills and institutionRankTechs, where the keys will be the actual objects referenced by Object.keys(character.progress)
        // Also save the school and titles for easy access, and set progressLists for later        
        for (const key of Object.keys(character.progress)) {
            let institution;
            if (Object.keys(dataManager.content.schools).includes(key)) {
                institution = dataManager.content.schools[key];
                dataManager.loaded.school = institution;
            }
            else {
                institution = dataManager.content.titles[key];                          
                dataManager.loaded.titles.add(institution);
            }            
            dataManager.loaded.institutionRanks.set(institution, 1);
            dataManager.loaded.institutionRankSkills.set(institution, []);
            dataManager.loaded.institutionRankTechs.set(institution, []);
            progressLists.set(institution, character.progress[key]);
        }

        let oldSkills = new Set();
        let currentSkills = new Set();
        let futureSkills = new Set();
        let oldTechs = new Set();
        let currentTechs = new Set();
        let futureTechs = new Set();

        // Loop through all the institutions from institutionRankSkills (or institutionRankTechs)
        for (const institution of dataManager.loaded.institutionRankSkills.keys()) {

            spentExp.set(institution, 0);
            progressExp.set(institution, 0);
            let previousRanksExp = 0;
            let learningIndex = 0;

            if (institution.initialAbility !== undefined) {
                techsLearned.add(institution.initialAbility);
                oldTechs.add(institution.initialAbility);
            }
            futureTechs.add(institution.finalAbility);

            // Loop through each rank in each curriculum            
            for (let i = 0; i < institution.curriculum.length; i++) {

                const skillSet = new Set();
                const techSet = new Set();

                // Loop through all the strings in institution.curriculum[i].list
                for (const refString of institution.curriculum[i].list) {
                    if (refString.startsWith('S: ')) {
                        // If it is an individual skill, add it to the skillSet
                        const skillRef = refString.slice(3);
                        skillSet.add(dataManager.content.skills[skillRef]);
                    }
                    else if (refString.startsWith('SG: ')) {
                        // If it is a group of skills, find all skills that belong to the group and add them to the skillSet
                        const skillGroup = refString.slice(4);
                        for (const skill of Object.values(dataManager.content.skills)) {
                            if (skill.groupRef === skillGroup) {
                                skillSet.add(skill);
                            }
                        }
                    }
                    if (refString.startsWith('T: ')) {
                        // If it is an individual technique, add it to the techSet
                        const techRef = refString.slice(3);
                        techSet.add(dataManager.content.techniques[techRef]);
                    }
                    else if (refString.startsWith('TG: ')) {
                        // If it is a group of techniques, find all techniques that belong to the group and add them to the techSet unless there is a clan restriction
                        const groupString = refString.slice(4).split(' ').reverse();
                        const groupRing = groupString[2];
                        const groupType = groupString[1];
                        const groupMaxRank = parseInt(groupString[0]);
                        for (const tech of Object.values(dataManager.content.techniques)) {
                            if ((!groupRing || tech.ringRef === groupRing) && tech.typeRef === groupType && tech.rank <= groupMaxRank && (!tech.clanRef || tech.clanRef === character.clanRef)) {
                                techSet.add(tech);
                            }
                        }
                    }
                }

                // Add skillSet and techSet to institutionRankSkills and institutionRankTechs respectively
                // A Set with index i corresponds to a school or title rank of i+1
                dataManager.loaded.institutionRankSkills.get(institution).push(skillSet);
                dataManager.loaded.institutionRankTechs.get(institution).push(techSet);

                const nextExpThreshold = previousRanksExp + institution.curriculum[i].exp;

                // Add everything that is learned for this rank to the corresponding maps or set, and calculate cost and progression
                // If the curriculum gets completed, finish all progress before ending the loop instead of stopping when nextExpThreshold is reached
                while ((progressExp.get(institution) < nextExpThreshold || i === institution.curriculum.length - 1) && learningIndex < progressLists.get(institution).length) {
                    let refString = progressLists.get(institution)[learningIndex];
                    let isFree = false;
                    // F stands for free. This means what is learned doesn't cost nor contribute experience points
                    if (refString.startsWith('F')) {
                        refString = refString.slice(1);
                        isFree = true;
                    }
                    if (refString.startsWith('R: ')) {
                        const ring = dataManager.content.rings[refString.slice(3)];
                        let newRank;
                        newRank = ringsLearned.get(ring) + 1;
                        ringsLearned.set(ring, newRank);
                        if (!isFree) {
                            const cost = newRank*ringCostPerRank;
                            spentExp.set(institution, spentExp.get(institution) + cost);
                            progressExp.set(institution, progressExp.get(institution) + cost/2);
                        }                    
                    }
                    else if (refString.startsWith('S: ')) {
                        const skill = dataManager.content.skills[refString.slice(3)];
                        let newRank;
                        if (skillsLearned.get(skill) !== undefined) {
                            newRank = skillsLearned.get(skill) + 1;
                        }
                        else {
                            newRank = 1;
                        }
                        skillsLearned.set(skill, newRank);
                        if (!isFree) {
                            const cost = newRank*skillCostPerRank;
                            spentExp.set(institution, spentExp.get(institution) + cost);
                            if (skillSet.has(skill)) {
                                progressExp.set(institution, progressExp.get(institution) + cost);
                            }
                            else {
                                progressExp.set(institution, progressExp.get(institution) + cost/2);
                            }
                        }
                    }
                    else { // refString.startsWith('T: ')
                        const tech = dataManager.content.techniques[refString.slice(3)];
                        techsLearned.add(tech);
                        if (!isFree) {
                            let techniqueCost = defaultTechCost;
                            if(tech.expCost !== undefined) {
                                techniqueCost = tech.expCost;
                            }
                            spentExp.set(institution, spentExp.get(institution) + techniqueCost);
                            if (techSet.has(tech)) {
                                progressExp.set(institution, progressExp.get(institution) + techniqueCost);
                            }
                            else {
                                progressExp.set(institution, progressExp.get(institution) + techniqueCost/2);
                            }
                        }
                    }
                    learningIndex += 1;
                }

                // Based on progressExp for this curriculum, determine if the skills and techniques in skillSet and techSet belong to a future rank, the current rank, or a past rank
                if (progressExp.get(institution) < previousRanksExp) {
                    // This rank has not been reached
                    futureSkills = new Set([...futureSkills, ...skillSet]);
                    futureTechs = new Set([...futureTechs, ...techSet]);
                }
                else if (progressExp.get(institution) < nextExpThreshold){
                    // This rank has been reached but has not been completed
                    currentSkills = new Set([...currentSkills, ...skillSet]);
                    currentTechs = new Set([...currentTechs, ...techSet]);
                }
                else {
                    // This rank has been completed
                    oldSkills = new Set([...oldSkills, ...skillSet]);
                    oldTechs = new Set([...oldTechs, ...techSet]);                    
                    // Increase institution rank each loop until it gets to its true value of the current rank
                    if (institution === dataManager.loaded.school) {
                        dataManager.loaded.institutionRanks.set(institution, dataManager.loaded.institutionRanks.get(institution) + 1);
                    }
                    // If the final rank belongs to the past, then the curriculum is complete: unlock the final ability of this institution
                    if (i === institution.curriculum.length - 1) {
                        techsLearned.add(institution.finalAbility);
                    }
                }
                // Increase previousRanksExp before going through the loop again
                previousRanksExp = nextExpThreshold;
            }
        }

        // Give a value to dataManager.loaded.remainingExp by substracting the calculated totalSpentExp from the stored receivedExp
        let totalSpentExp = 0;
        for (const partialAmount of spentExp.values()) {
            totalSpentExp += partialAmount;
        }
        dataManager.loaded.remainingExp = dataManager.loaded.character.receivedExp - totalSpentExp;

        document.getElementById("spentExp").innerHTML = totalSpentExp;
        document.getElementById("schoolExp").innerHTML = progressExp.get(dataManager.loaded.school);
        document.getElementById("schoolRank").innerHTML = dataManager.loaded.institutionRanks.get(dataManager.loaded.school);

        // Utility function that returns a map based on the 1st parameter keys, with rank = 0 except for those from the 2nd parameter
        // Depending on what the map will be used for, upgradeableOnly determines whether rank 5 should be excluded or not
        function getFullMap(keys, learnedMap, upgradeableOnly) {
            const filteredMap = new Map();
            for (const key of keys) {
                if (learnedMap.has(key)) {
                    if (!upgradeableOnly || learnedMap.get(key) < 5) {
                        filteredMap.set(key, learnedMap.get(key));
                    }
                }
                else {
                    filteredMap.set(key, 0);
                }
            }
            return filteredMap;
        }

        // Update the map of all rings
        dataManager.loaded.ringMaps.all = ringsLearned;

        // Update the map of all upgradable rings (ring ranks >= 5 not included)
        // The first property ("any") of dataManager.content.rings is not used
        dataManager.loaded.ringMaps.upgradable = getFullMap(Object.values(dataManager.content.rings).splice(1, 5), ringsLearned, true);

        // Update the map of all known skills
        dataManager.loaded.skillMaps.learned = skillsLearned;

        // Update the map of all skills
        dataManager.loaded.skillMaps.all = getFullMap(Object.values(dataManager.content.skills), skillsLearned, false);

        // Update the map of all upgradable skills (skill ranks >= 5 not included)
        dataManager.loaded.skillMaps.upgradable = getFullMap(Object.values(dataManager.content.skills), skillsLearned, true);

        // Update the map of all curricula skills
        dataManager.loaded.skillMaps.included = getFullMap(new Set([...oldSkills, ...currentSkills, ...futureSkills]), skillsLearned, false);

        // Update the map of all skills that fully contribute to the school or a title
        dataManager.loaded.skillMaps.current = getFullMap(currentSkills, skillsLearned, false);

        // Update the set of all known techniques
        dataManager.loaded.techSets.learned = techsLearned;

        const compatibleTechsBase = new Set();
        for (const tech of Object.values(dataManager.content.techniques)) {
            if (dataManager.loaded.school.techniqueTypeRefs.includes(tech.typeRef)) {
                compatibleTechsBase.add(tech);
            }
        }
        // Update the set of all compatible techniques (learned not included)
        dataManager.loaded.techSets.compatible = new Set([...new Set([...compatibleTechsBase, ...currentTechs, ...futureTechs])].filter(x => !techsLearned.has(x)));

        const availableTechsBase = new Set();
        for (const tech of compatibleTechsBase) {
            if (tech.rank <= dataManager.loaded.institutionRanks.get(dataManager.loaded.school)) {
                availableTechsBase.add(tech);
            }
        }
        // Update the set of all available techniques (learned not included)
        dataManager.loaded.techSets.available = new Set([...new Set([...availableTechsBase, ...currentTechs])].filter(x => !techsLearned.has(x)));

        // Update the set of all curricula techniques
        dataManager.loaded.techSets.included = new Set([...oldTechs, ...currentTechs, ...futureTechs]);

        // Update the set of all techniques that fully contribute to the school or a title
        dataManager.loaded.techSets.current = currentTechs;

        // Update the set of all missable techniques
        dataManager.loaded.techSets.missable = new Set([...dataManager.loaded.techSets.included].filter(x => !compatibleTechsBase.has(x) && x.typeRef !== "school ability" && x.typeRef !== "mastery ability" && x.typeRef !== "title effect" && x.typeRef !== "title ability"));
    }
}

class ContentManager {

    constructor() {

        // Singleton pattern
        if (ContentManager.instance) {
            return ContentManager.instance;
        }
        ContentManager.instance = this;

        this.overlay = document.getElementById("overlay");
        this.viewer = document.getElementById("viewer");

        this.rings = {
            div: document.getElementById("ringDiv")
        }
        this.skills = {
            list: document.getElementById("skillList"),
            expanded: null // [skill, element]
        }
        this.techniques = {
            list: document.getElementById("techniqueList"),
        }

        // this.unload is used in the loadTab function and specifies which tab's content should be unloaded when switching to another tab
        this.unload = {
            character: true,
            rings: true,
            skills: false,
            techniques: false,
            experience: true,
            items: true,
            beginner: true
        }
    }

    // contentManager.initialize sets form content to the last state according to dataManager.userSettings.values
    initialize(languageChanged) {
        for (const filterName of ["skillGroupFilter", "skillRankFilter", "skillAvailabilityFilter", "skillCurriculaFilter", "techRankFilter", "techTypeFilter", "techRingFilter", "techActivationFilter", "techAvailabilityFilter", "techCurriculaFilter"]) {
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
                if (dataManager.userSettings.values[filterName] !== undefined) {
                    document.getElementById(filterName).value = dataManager.userSettings.values[filterName];
                }
                else {
                    document.getElementById(filterName).value = selectElement.options[0].value;
                }
            }
        }
    }

    displayStats() {

        contentManager.rings.div.innerHTML = " ";

        const fragment = document.createDocumentFragment();

        const ringGrid = document.createElement("div");
        ringGrid.classList.add("ringGrid");

        const divMap = new Map();
        let i = 0;
        const keys = ["focus", "air", "vigilance", "fire", "void", "water", "endurance", "earth", "composure"];
        for (let row = 1; row <= 5; row++) {
            for (let column = 1; column <= 5; column++) {
                if ([1, 3, 5].includes(row) && [1, 3, 5].includes(column)) {

                    const div = document.createElement("div");
                    if (row !== 3 && column !== 3) {
                        div.style.setProperty("grid-row-start", row);
                        div.style.setProperty("grid-column-start", column);
                    }                    
                    
                    ringGrid.appendChild(div);
                    divMap.set(keys[i], div);
                    i++;
                }
                else if ([2, 3, 4].includes(row) && [2, 3, 4].includes(column)) {
                    continue;
                }
                else {
                    const arrowSpan = document.createElement("span");
                    arrowSpan.style.setProperty("grid-row-start", row);
                    arrowSpan.style.setProperty("grid-column-start", column);
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
                    arrowSpan.classList.add("veryLargeFontSize");
                    ringGrid.appendChild(arrowSpan);
                }                
            }
        }
        // The first property ("any") of dataManager.content.rings is not used
        for (const ringRef of Object.keys(dataManager.content.rings).splice(1, 5)) {

            if (ringRef === "void") {
                divMap.get("void").classList.add("columnContainer", "voidDiv");

                const ringDiv = document.createElement("div");
                divMap.get("void").appendChild(ringDiv);

                const pointSpan = document.createElement("span");
                pointSpan.textContent = `${dataManager.content.ui.voidPoints} ${dataManager.loaded.character.voidPoints}/${dataManager.loaded.ringMaps.all.get(dataManager.content.rings["void"])}`;
                divMap.get("void").appendChild(pointSpan);

                const buttonLine = document.createElement("div");
                divMap.get("void").appendChild(buttonLine);

                const substract = document.createElement("button");
                substract.textContent = "-";
                substract.addEventListener('click', () => {
                    dataManager.loaded.character.changeVoidPoints(-1);
                });
                buttonLine.appendChild(substract);

                const add = document.createElement("button");
                add.textContent = "+";
                add.addEventListener('click', () => {
                    dataManager.loaded.character.changeVoidPoints(1);
                });
                buttonLine.appendChild(add);

                divMap.set("void", ringDiv);
            }

            const iconSpan = document.createElement("span");
            iconSpan.textContent = String.fromCharCode(dataManager.content.ui.customIcons[`${ringRef}Icon`]);
            iconSpan.classList.add("giantIcon", ringRef);
            divMap.get(ringRef).appendChild(iconSpan);

            const nameSpan = document.createElement("span");
            nameSpan.textContent = dataManager.content.rings[ringRef].name;
            nameSpan.classList.add("largeFontSize");
            divMap.get(ringRef).appendChild(nameSpan);

            const rankSpan = document.createElement("span");
            rankSpan.textContent = `${dataManager.content.ui.rank} ${dataManager.loaded.ringMaps.all.get(dataManager.content.rings[ringRef])}`;
            divMap.get(ringRef).appendChild(rankSpan);
            
            divMap.get(ringRef).classList.add("ring");
            divMap.get(ringRef).addEventListener('click', () => {
                contentManager.confirm(contentManager.increaseRing, ringRef);
            });            
        }

        for (const attributeRef of ["focus", "vigilance"]) {
            divMap.get(attributeRef).textContent = dataManager.content.ui[attributeRef] + " " + dataManager.loaded.character[attributeRef];
        }
        for (const attributeRef of ["endurance", "composure"]) {
            let extra;
            if (attributeRef === "endurance") {
                extra = [dataManager.content.ui["fatigue"], dataManager.loaded.character["fatigue"], "changeFatigue"];
            }
            else {
                extra = [dataManager.content.ui["strife"], dataManager.loaded.character["strife"], "changeStrife"];
            }

            divMap.get(attributeRef).classList.add("columnContainer");

            const extraSpan = document.createElement("span");
            extraSpan.textContent =  extra[0] + " " + extra[1];
            extraSpan.style.setProperty("border-bottom", "1px solid black");
            divMap.get(attributeRef).appendChild(extraSpan);

            const textSpan = document.createElement("span");
            textSpan.textContent = dataManager.content.ui[attributeRef] + " " + dataManager.loaded.character[attributeRef];
            divMap.get(attributeRef).appendChild(textSpan);

            const buttonLine = document.createElement("div");
            divMap.get(attributeRef).appendChild(buttonLine);

            const substract = document.createElement("button");
            substract.textContent = "-";
            substract.addEventListener('click', () => {
                dataManager.loaded.character[extra[2]](-1);
            });
            buttonLine.appendChild(substract);

            const add = document.createElement("button");
            add.textContent = "+";
            add.addEventListener('click', () => {
                dataManager.loaded.character[extra[2]](1);
            });
            buttonLine.appendChild(add);
        }
        fragment.appendChild(ringGrid);

        const buttonDiv = document.createElement("div");
        buttonDiv.classList.add("columnContainer");
        buttonDiv.style.setProperty("width", "50%");
        buttonDiv.style.setProperty("align-self", "center");

        const endSceneButton = document.createElement("button");
        endSceneButton.textContent = dataManager.content.ui.endScene;
        endSceneButton.addEventListener('click', () => {
            dataManager.loaded.character.endScene();
        });
        buttonDiv.appendChild(endSceneButton);

        const restButton = document.createElement("button");
        restButton.textContent = dataManager.content.ui.rest;
        restButton.addEventListener('click', () => {
            dataManager.loaded.character.rest();
        });
        buttonDiv.appendChild(restButton);

        const unmaskButton = document.createElement("button");
        unmaskButton.textContent = dataManager.content.ui.unmask;
        unmaskButton.addEventListener('click', () => {
            dataManager.loaded.character.unmask();
        });
        buttonDiv.appendChild(unmaskButton);

        fragment.appendChild(buttonDiv);
        contentManager.rings.div.appendChild(fragment);
    }

    filterSkills() {

        // Get the filter settings and change dataManager.userSettings.values
        const values = dataManager.userSettings.values;
        for (const filterName of ["skillGroupFilter", "skillRankFilter", "skillAvailabilityFilter", "skillCurriculaFilter"]) {
            values[filterName] = document.getElementById(filterName).value;
        }
        // Cache userSettings
        dataManager.cacheUserSettings();

        // Get a combinedArray from the intersection of 2 maps, depending on availability and curricula filter settings
        let availabilityMap;
        switch(values.skillAvailabilityFilter) {
            case "learned":
                availabilityMap = dataManager.loaded.skillMaps.learned;
                break;            
            case "upgradable":
                availabilityMap = dataManager.loaded.skillMaps.upgradable;
                break;
            case "all":
                availabilityMap = dataManager.loaded.skillMaps.all;            
        }

        let combinedArray;
        switch(values.skillCurriculaFilter) {
            case "any":
                combinedArray = [...availabilityMap];
                break;
            case "excluded":
                combinedArray = [...availabilityMap].filter(x => !dataManager.loaded.skillMaps.included.has(x[0]));
                break;
            case "included":
                combinedArray = [...availabilityMap].filter(x => dataManager.loaded.skillMaps.included.has(x[0]));
                break;
            case "current":
                combinedArray = [...availabilityMap].filter(x => dataManager.loaded.skillMaps.current.has(x[0]));
        }
        
        // Additional filtering based on skill group
        const filteredSkills = combinedArray.filter(pair => {
            if (values.skillGroupFilter !== "any" && pair[0].groupRef !== values.skillGroupFilter) {
                return false;
            }
            if (values.skillRankFilter !== "any" && pair[1] !== parseInt(values.skillRankFilter)) {
                return false;
            }
            return true;
        });

        // ADD A NO RESULT MESSAGE IF NO RESULT, ELSE KEEP GOING

        // Ordering the array by alphabetical order of skill names
        filteredSkills.sort(function(a, b) {
            if (a[0].name < b[0].name) {
                return -1;
            }
            else if (a[0].name > b[0].name) {
                return 1;
            }
            else {
                return 0;
            }
        });

        // Clear the list
        contentManager.skills.list.innerHTML = "";        

        // Create the fragment that will contain the new list elements
        const fragment = document.createDocumentFragment();

        // Create li elements to display for each skill, with span elements inside, each with the proper content and classes for styling
        const customIcons = dataManager.content.ui.customIcons;

        // pair is an array of a skill and its corresponding rank
        for (const pair of filteredSkills) {

            const li = document.createElement("li");
            const consultDiv = document.createElement("div");
            consultDiv.classList.add("pointer");
            const container = document.createElement("div");
            consultDiv.addEventListener('click', () => {
                contentManager.expandSkill(container, pair[0], pair[1]);
            });

            const dice = document.createElement("span");
            dice.textContent = `${pair[1]} ${String.fromCharCode(customIcons.skillDieIcon)}`;
            dice.classList.add("bold");
            consultDiv.appendChild(dice);

            const skillName = document.createElement("span");
            skillName.textContent = pair[0].name;
            skillName.classList.add("flexGrow");
            consultDiv.appendChild(skillName);

            if (pair[1] < 5) {
                const curriculaDiv = document.createElement("div");
                const institutionRanks = dataManager.loaded.institutionRanks;

                // If the skill is included in dataManager.loaded.institutionRankSkills, add the school rank number or Ⓣ
                for (const institution of institutionRanks.keys()) {
                    const rankArrays = dataManager.loaded.institutionRankSkills.get(institution);

                    for (let i = 0; i < rankArrays.length; i++) {
                        if (rankArrays[i].has(pair[0])) {

                            const numSpan = document.createElement("span");
                            numSpan.classList.add("largeFontSize");
                            if (i === institutionRanks.get(institution) - 1) {
                                numSpan.classList.add("customColor", "bold");
                            }

                            if (institution === dataManager.loaded.school) {
                                numSpan.textContent += String.fromCharCode(`0xe90${i+4}`);
                            }
                            else {
                                numSpan.textContent += String.fromCharCode(customIcons.titleIcon);           
                            }
                            curriculaDiv.appendChild(numSpan);
                        }
                    }
                }
                if (curriculaDiv.firstChild) {
                    curriculaDiv.classList.add("iconGrid");
                    consultDiv.appendChild(curriculaDiv);
                }
            }
            li.appendChild(consultDiv);

            // If the skill has at least one level learned, it will have the learned style, otherwise it will have the available style
            if (dataManager.loaded.skillMaps.learned.has(pair[0])) {
                li.classList.add("customColor");
            }
            else {
                li.classList.add("available");
            }

            // If a skill is upgradable, addSymbolSpan is added
            if (dataManager.loaded.skillMaps.upgradable.has(pair[0])) {
                const addSymbolSpan = document.createElement("span");
                addSymbolSpan.textContent = "+";
                addSymbolSpan.classList.add("addSymbol", "pointer");
                addSymbolSpan.addEventListener('click', () => {
                    contentManager.confirm(contentManager.upgradeSkill, pair[0]);
                });
                li.appendChild(addSymbolSpan);
            }
            // Add each completed li to the fragment and to the item list
            li.classList.add("rounded");
            container.appendChild(li);
            fragment.appendChild(container);
        }
        // Create the new list from the completed fragment
        contentManager.skills.list.appendChild(fragment);

        contentManager.skills.list.scrollTop = 0;
    }

    filterTechniques() {

        // Get the filter settings and change dataManager.userSettings.values
        const values = dataManager.userSettings.values;
        for (const filterName of ["techRankFilter", "techTypeFilter", "techActivationFilter", "techRingFilter", "techAvailabilityFilter", "techCurriculaFilter"]) {
            values[filterName] = document.getElementById(filterName).value;
        }
        // Cache userSettings
        dataManager.cacheUserSettings();

        // Get a combinedArray from the intersection of 2 sets, depending on availability and curricula filter settings
        let availabilitySet;
        switch(values.techAvailabilityFilter) {
            case "learned":
                availabilitySet = dataManager.loaded.techSets.learned;
                break;
            case "missable":
                availabilitySet = dataManager.loaded.techSets.missable;
                break;
            case "available":
                availabilitySet = dataManager.loaded.techSets.available;
                break;
            case "compatible":
                availabilitySet = dataManager.loaded.techSets.compatible;
                break;
            case "all":
                availabilitySet = new Set(Object.values(dataManager.content.techniques));
                const institutions = Object.values(dataManager.content.schools).concat(Object.values(dataManager.content.titles));
                for (const institution of institutions) {
                    if (institution.initialAbility !== undefined) {
                        availabilitySet.add(institution.initialAbility);
                    }
                    availabilitySet.add(institution.finalAbility);
                }
        }
        let combinedArray;
        switch(values.techCurriculaFilter) {            
            case "any":
                combinedArray = [...availabilitySet];
                break;            
            case "excluded":
                combinedArray = [...availabilitySet].filter(x => !dataManager.loaded.techSets.included.has(x));
                break;
            case "included":
                combinedArray = [...availabilitySet].filter(x => dataManager.loaded.techSets.included.has(x));
                break;
            case "current":
                combinedArray = [...availabilitySet].filter(x => dataManager.loaded.techSets.current.has(x));
        }

        // Additional filtering based on rank, type, activation, ring and clan
        const filteredTechniques = combinedArray.filter(technique => {
            if (values.techRankFilter !== "any" && technique.rank !== parseInt(values.techRankFilter)) {
                return false;
            }
            if (values.techTypeFilter !== "any" && technique.typeRef !== values.techTypeFilter) {
                return false;
            }
            if (values.techActivationFilter !== "any" && !technique.activationSet.has(values.techActivationFilter)) {
                return false;
            }
            if (values.techRingFilter !== "any" && technique.ringRef !== values.techRingFilter) {
                return false;
            }
            if (technique.clanRef !== undefined && technique.clanRef !== dataManager.loaded.character.clanRef && values.techAvailabilityFilter !== "all") {
                return false;
            }
            return true;
        });

        // ADD A NO RESULT MESSAGE IF NO RESULT, ELSE KEEP GOING

        // Ordering the array based on rank order, then types and rings order from the source book, then alphabetical order of names
        const techTypeRefOrder = ["school ability", "kata", "kihō", "invocation", "ritual", "shūji", "mahō", "ninjutsu", "mastery ability", "title effect", "title ability"];
        const ringOrder = ["none", "air", "earth", "fire", "water", "void"];
        filteredTechniques.sort(function(a, b) {            
            if (a.rank < b.rank) {
                return -1;
            }
            else if (a.rank > b.rank) {
                return 1;
            }
            else {
                if (techTypeRefOrder.indexOf(a.typeRef) < techTypeRefOrder.indexOf(b.typeRef)) {
                    return -1;
                }
                else if (techTypeRefOrder.indexOf(a.typeRef) > techTypeRefOrder.indexOf(b.typeRef)) {
                    return 1;
                }
                else {
                    if (ringOrder.indexOf(a.ringRef) < ringOrder.indexOf(b.ringRef)) {
                        return -1;
                    }
                    else if (ringOrder.indexOf(a.ringRef) > ringOrder.indexOf(b.ringRef)) {
                        return 1;
                    }
                    else {
                        if (a.name < b.name) {
                            return -1;
                        }
                        else if (a.name > b.name) {
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
        contentManager.techniques.list.innerHTML = "";

        // Create the fragment that will contain the new list elements
        const fragment = document.createDocumentFragment();

        // Create li elements to display for each technique, with span elements inside, each with the proper content and classes for styling
        const customIcons = dataManager.content.ui.customIcons;
        for (const tech of filteredTechniques) {

            const li = document.createElement("li");
            const consultDiv = document.createElement("div");
            consultDiv.classList.add("pointer");
            consultDiv.addEventListener('click', () => {
                contentManager.consultTechnique(li, tech);
            });
            li.appendChild(consultDiv);

            const rankSpan = document.createElement("span");
            if (tech.rank < 7) {
                rankSpan.textContent = tech.rank;
            }
            rankSpan.classList.add("rank");
            consultDiv.appendChild(rankSpan);

            const typeIconSpan = document.createElement("span");            
            typeIconSpan.classList.add("largeIcon");            
            if (["kata", "kihō", "invocation", "ritual", "shūji", "mahō", "ninjutsu"].includes(tech.typeRef)) {
                typeIconSpan.textContent = String.fromCharCode(customIcons[`${tech.typeRef}Icon`]);
                li.classList.add("rounded");
            }
            else if (["school ability", "mastery ability"].includes(tech.typeRef)) {
                typeIconSpan.textContent = String.fromCharCode(customIcons.schoolIcon);
            }
            else {
                typeIconSpan.textContent = String.fromCharCode(customIcons.titleIcon);
            }
            consultDiv.appendChild(typeIconSpan);

            const ringDieIconSpan = document.createElement("span");
            if (tech.ringRef !== "none") {
                ringDieIconSpan.textContent = String.fromCharCode(customIcons[`${tech.ringRef}Icon`]);
                ringDieIconSpan.classList.add("largeIcon", tech.ringRef);
                consultDiv.appendChild(ringDieIconSpan);
            }
            
            const clanIconSpan = document.createElement("span");
            if (tech.clanRef !== undefined) {
                clanIconSpan.textContent = String.fromCharCode(customIcons[`${tech.clanRef}Icon`]);
                clanIconSpan.classList.add("largeIcon");
                consultDiv.appendChild(clanIconSpan);
            }

            const activationDiv = document.createElement("div");
            for (const keyword of tech.activationSet) {
                if (["action", "downtime", "opportunity", "void", "limited", "permanent"].includes(keyword)) {
                    const iconSpan = document.createElement("span");
                    iconSpan.textContent += String.fromCharCode(customIcons[`${keyword}Icon`]);
                    activationDiv.appendChild(iconSpan);
                }                
            }            
            activationDiv.classList.add("iconGrid");
            consultDiv.appendChild(activationDiv);

            const nameSpan = document.createElement("span");            
            nameSpan.textContent = tech.name;            
            
            // If there is an extra name to display, the element with the name class will be a container of 2 spans instead of a single span
            let addedElement;
            const traditionRef = dataManager.loaded.school.traditionRef;
            if (tech.extraNames !== undefined) {

                const displayTraditionalName = traditionRef !== undefined && Object.keys(tech.extraNames).includes(traditionRef);
                const displayAbilityOrigin = tech.extraNames.abilityOrigin !== undefined;

                if (displayTraditionalName || displayAbilityOrigin) {
                    addedElement = document.createElement("div");
                    const extraNameSpan = document.createElement("span");
                    if (displayTraditionalName) {
                        extraNameSpan.textContent = tech.extraNames[traditionRef];
                        extraNameSpan.classList.add("customColor", "italic");
                        addedElement.appendChild(nameSpan);
                        addedElement.appendChild(extraNameSpan);
                    }
                    if (displayAbilityOrigin) {
                        extraNameSpan.textContent = tech.extraNames.abilityOrigin;
                        extraNameSpan.classList.add("customColor", "italic");
                        addedElement.appendChild(extraNameSpan);
                        addedElement.appendChild(nameSpan);                    
                    }                    
                }
                else {
                    addedElement = nameSpan;
                }
            }
            else {
                addedElement = nameSpan;
            }
            addedElement.classList.add("columnContainer", "flexGrow");
            consultDiv.appendChild(addedElement);

            if (!dataManager.loaded.techSets.learned.has(tech)) {

                const curriculaDiv = document.createElement("div");
                const institutionRanks = dataManager.loaded.institutionRanks;

                // If the technique is included in dataManager.loaded.institutionRankTechs, add the school rank number or Ⓣ
                for (const institution of institutionRanks.keys()) {
                    const rankArrays = dataManager.loaded.institutionRankTechs.get(institution);

                    for (let i = 0; i < rankArrays.length; i++) {
                        if (rankArrays[i].has(tech)) {

                            const numSpan = document.createElement("span");
                            numSpan.classList.add("largeFontSize");
                            if (i === institutionRanks.get(institution) - 1) {
                                numSpan.classList.add("customColor", "bold");
                            }

                            if (institution === dataManager.loaded.school) {
                                numSpan.textContent += String.fromCharCode(`0xe90${i+4}`);
                            }
                            else {
                                numSpan.textContent += String.fromCharCode(customIcons.titleIcon);
                            }
                            curriculaDiv.appendChild(numSpan);
                        }
                    }
                }
                if (curriculaDiv.firstChild) {
                    curriculaDiv.classList.add("iconGrid");
                    consultDiv.appendChild(curriculaDiv);
                }

                // Here the technique has not been learned, but if it is available or incompatible, the added class will allow it to be styled accordingly
                // Compatible is the default style and does not need a class
                if (dataManager.loaded.techSets.available.has(tech)) {
                    li.classList.add("available");
                    const addSymbolSpan = document.createElement("span");
                    addSymbolSpan.textContent = "+";
                    addSymbolSpan.classList.add("addSymbol", "pointer");
                    addSymbolSpan.addEventListener('click', () => {
                        contentManager.confirm(contentManager.learnTechnique, tech);
                    });
                    li.appendChild(addSymbolSpan);
                }             
                else if (!dataManager.loaded.techSets.compatible.has(tech)) {
                    li.classList.add("incompatible");
                }
            }
            else {
                // If the technique is learned
                li.classList.add("customColor");
            }           

            // Add each completed li to the fragment and to the item list
            fragment.appendChild(li);
        }
        // Create the new list from the completed fragment
        contentManager.techniques.list.appendChild(fragment);

        contentManager.techniques.list.scrollTop = 0;
    }

    clearContent(tabClass) {
        let tabClasses;
        if (tabClass !== undefined) {
            tabClasses = [tabClass];
        }
        else {
            tabClasses = Object.keys(contentManager.unload);
        }

        for (const tabClass of tabClasses) {
            switch(tabClass) {
                case "character":
                    
                    break;            
                case "rings":
                    contentManager.rings.div.innerHTML = "";
                    break;
                case "skills":
                    contentManager.skills.list.innerHTML = "";
                    contentManager.skills.expanded = null;
                    break;
                case "techniques":
                    contentManager.techniques.list.innerHTML = "";
                    break;
                case "experience":
                    
                    break;
                case "items":
                    
                    break;
                case "beginner":
                    
            }
        }        
    }

    loadTab(newTabClass) {
        if (newTabClass !== dataManager.userSettings.values.currentTabClass) {
            // Remove "currentTab" from the previous tab
            for (const element of document.getElementsByClassName(dataManager.userSettings.values.currentTabClass)) {
                element.classList.remove("currentTab");
            }

            // If some of the previous tab's elements should be removed, do so
            if (contentManager.unload[dataManager.userSettings.values.currentTabClass]) {
                contentManager.clearContent(dataManager.userSettings.values.currentTabClass);
            }

            // Depending on whether newTabClass is defined, update currentTabClass and cache it, or update newTabClass
            if(newTabClass !== undefined) {                
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
        switch(newTabClass) {
            case "character":
                
                break;            
            case "rings":
                if (contentManager.rings.div.children.length === 0) {
                    contentManager.displayStats();
                }                    
                break;
            case "skills":
                if (contentManager.skills.list.children.length === 0) {
                    contentManager.filterSkills();
                }
                break;
            case "techniques":
                if (contentManager.techniques.list.children.length === 0) {
                    contentManager.filterTechniques();
                }
                break;
            case "experience":
                
                break;
            case "items":
                
                break;
            case "beginner":
                
        }
    }

    expandSkill(container, skill, rank) {

        if (contentManager.skills.expanded !== null) {
            contentManager.skills.expanded[1].remove();
            if (contentManager.skills.expanded[0] === skill) {
                contentManager.skills.expanded = null;
                return;
            }
        }

        // Create the fragment that will contain the skill approach elements
        const fragment = document.createDocumentFragment();

        // Create elements to display, each with the proper content and classes for styling

        const approachGrid = document.createElement("div");
        contentManager.skills.expanded = [skill, approachGrid];

        const customIcons = dataManager.content.ui.customIcons;

        const approachGroup = document.createElement("div");
        approachGroup.textContent = dataManager.content.skillGroups[skill.groupRef].approaches;
        approachGrid.appendChild(approachGroup);

        // Create a line for each possible approach
        // The first property ("any") of dataManager.content.rings is not used
        for (const ringRef of Object.keys(dataManager.content.rings).splice(1, 5)) {
            const ring = dataManager.content.rings[ringRef];            
    
            const approachLine = document.createElement("div");

            const dice = document.createElement("span");
            dice.textContent = `${dataManager.loaded.ringMaps.all.get(ring)} ${String.fromCharCode(customIcons.ringDieIcon)}`;
            dice.classList.add("bold");
            approachLine.appendChild(dice);

            const icon = document.createElement("span");
            icon.textContent = String.fromCharCode(customIcons[`${ringRef}Icon`]);;
            icon.classList.add(ringRef, "smallIcon");
            approachLine.appendChild(icon);

            const approachName = document.createElement("span");
            approachName.textContent = `${ring.approachNames[skill.groupRef]} (${ring.name})`;
            approachLine.appendChild(approachName);

            approachLine.classList.add("approachLine", "pointer");
            approachLine.addEventListener('click', () => {
                contentManager.consultSkill(container.firstChild, skill, rank, ringRef);
            });
            approachGrid.appendChild(approachLine);
        }

        // Add the completed approachGrid to the fragment
        approachGrid.classList.add("columnContainer", "approachGrid");
        fragment.appendChild(approachGrid);

        // Create the new elements
        container.appendChild(fragment);
    }

    consultSkill(li, skill, rank, ringRef) {

        if (!contentManager.viewer.classList.contains("visible")) {
            document.querySelector(':root').style.setProperty('--liTop', li.getBoundingClientRect().top + "px");
            document.getElementById("main").classList.add("disabled");
            contentManager.overlay.classList.add("appear");
            contentManager.viewer.classList.add("appear");
        }

        // Clear the viewer
        contentManager.viewer.innerHTML = "";        

        // Create the fragment that will contain the new viewer elements
        const fragment = document.createDocumentFragment();

        // Create elements to display, each with the proper content and classes for styling

        const attributes = document.createElement("div");
        const customIcons = dataManager.content.ui.customIcons;
        const ring = dataManager.content.rings[ringRef];

        const groupSpan = document.createElement("span");
        groupSpan.textContent = dataManager.content.skillGroups[skill.groupRef].skillType;
        attributes.appendChild(groupSpan);

        // Create ring buttons
        const buttonContainer = document.createElement("div");
        // The first property ("any") of dataManager.content.rings is not used
        for (const buttonRingRef of Object.keys(dataManager.content.rings).splice(1, 5)) {
            const ringButton = document.createElement("button");
            ringButton.textContent = String.fromCharCode(customIcons[`${buttonRingRef}Icon`]);
            ringButton.classList.add("largeFontSize");
            if (buttonRingRef === ringRef) {
                ringButton.classList.add("currentTab", buttonRingRef);
            }            
            ringButton.addEventListener('click', (event) => {                    
                contentManager.consultSkill(li, skill, rank, buttonRingRef);
                // When the button is clicked, hideOverlay() will trigger because the event will think we clicked outside of the viewer, as the button has been deleted
                // To prevent hideOverlay() from running, we need to stop the event from reaching overlay
                event.stopPropagation();
            });
            buttonContainer.classList.add("alignCenter");
            buttonContainer.appendChild(ringButton);
        }
        attributes.appendChild(buttonContainer);

        attributes.classList.add("spaceBetween", "alignCenter");
        fragment.appendChild(attributes);

        const namesDiv = document.createElement("div");

        const nameSpan = document.createElement("span");
        nameSpan.textContent = skill.name;
        nameSpan.classList.add("bold");
        namesDiv.appendChild(nameSpan);

        const approachSpan = document.createElement("span");
        approachSpan.textContent = `${ring.approachNames[skill.groupRef]} (${ring.name})`;
        namesDiv.appendChild(approachSpan);        

        namesDiv.classList.add("columnContainer", "title", "largeFontSize");
        fragment.appendChild(namesDiv);

        const diceSpan = document.createElement("span");
        diceSpan.textContent = `${dataManager.loaded.ringMaps.all.get(ring)} ${String.fromCharCode(customIcons.ringDieIcon)} + ${rank} ${String.fromCharCode(customIcons.skillDieIcon)}`;
        diceSpan.classList.add("largeFontSize", "spaceEvenly");
        fragment.appendChild(diceSpan);

        /* INCLUDE DESCRIPTION? IF NOT, DELETE IT FROM SKILL CONTENT

        const descriptionDiv = document.createElement("div");
        for (let string of skill.description) {
            const paragraph = document.createElement("p");
            paragraph.textContent = string;                   
            descriptionDiv.appendChild(paragraph);
        }
        fragment.appendChild(descriptionDiv);
        */

        const uses = document.createElement("ul");
        for (let string of skill.uses[ringRef]) {
            const use = document.createElement("li");
            use.textContent = string;                   
            uses.appendChild(use);
        }
        fragment.appendChild(uses);

        // Add the new viewer content from the completed fragment
        contentManager.viewer.appendChild(fragment);

        const stringArrayMap = new Map();

        // Make a shallow copy of dataManager.content.rings.any.opportunities.general to leave the original intact after we push strings
        const generalArray = [...dataManager.content.rings.any.opportunities.general];
        for (const string of ring.opportunities.general) {
            generalArray.push(string);
        }
        stringArrayMap.set("general", generalArray);

        const conflictArray = [];
        if (skill.groupRef === "martial") {
            for (const string of ring.opportunities.conflict) {
                conflictArray.push(string);
            }
            stringArrayMap.set("conflict", conflictArray);
        }
        else {
            const skillArray = [ring.opportunities.skillGroups[skill.groupRef]];
            stringArrayMap.set("skill", skillArray);
        }

        const initiativeArray = [];
        const initiativeSkills = ["sentiment", "meditation", "tactics", "command"];
        for (const initiativeSkill of initiativeSkills) {
            if (dataManager.content.skills[initiativeSkill] === skill) {
                initiativeArray.push(ring.opportunities.initiative);
                stringArrayMap.set("initiative", initiativeArray);
                break;
            }
        }

        const downtimeArray = [];
        for (const string of ring.opportunities.downtime) {
            downtimeArray.push(string);
        }
        stringArrayMap.set("downtime", downtimeArray);

        // Go through everything in stringArrayMap and add the corresponding elements
        for (const key of stringArrayMap.keys()) {
            const opportunity = document.createElement("p");
            opportunity.textContent = dataManager.content.ui.exampleOpportunities[key];
            opportunity.classList.add("opportunities", "italic", "largeFontSize");
            fragment.appendChild(opportunity);

            const container = document.createElement("div");
            for (let string of stringArrayMap.get(key)) {
                const paragraph = document.createElement("p");
                
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
                // Arbitrary limit on bold part length set at 20 to avoid false positives
                const splitPosition = string.search(":") + 1;
                if (splitPosition > 0 && splitPosition < 20) {
                    
                    const boldSpan = document.createElement("span");
                    boldSpan.textContent = string.slice(0, splitPosition);
                    boldSpan.classList.add("bold");
                    paragraph.appendChild(boldSpan);

                    const normalSpan = document.createElement("span");
                    normalSpan.textContent = string.slice(splitPosition, string.length);
                    paragraph.appendChild(normalSpan);
                }
                else {
                    paragraph.textContent = string;
                }
                container.appendChild(paragraph);
            }
            fragment.appendChild(container);
        }
        // Add the new viewer content from the completed fragment
        contentManager.viewer.appendChild(fragment);
    }

    consultTechnique(li, tech, optionalRing) {

        if (!contentManager.viewer.classList.contains("visible")) {
            document.querySelector(':root').style.setProperty('--liTop', li.getBoundingClientRect().top + "px");
            document.getElementById("main").classList.add("disabled");
            contentManager.overlay.classList.add("appear");
            contentManager.viewer.classList.add("appear");
        }

        // Clear the viewer
        contentManager.viewer.innerHTML = "";

        // Create the fragment that will contain the new viewer elements
        const fragment = document.createDocumentFragment();

        // Create elements to display, each with the proper content and classes for styling

        const attributes = document.createElement("div");

        const rankSpan = document.createElement("span");
        rankSpan.textContent = `${dataManager.content.ui.rank} ${tech.rank}`;
        attributes.appendChild(rankSpan);

        const customIcons = dataManager.content.ui.customIcons;

        const typeSpan = document.createElement("span");
        let typeIcon;
        if (["kata", "kihō", "invocation", "ritual", "shūji", "mahō", "ninjutsu"].includes(tech.typeRef)) {
            typeIcon = String.fromCharCode(customIcons[`${tech.typeRef}Icon`]);
        }
        else if (["school ability", "mastery ability"].includes(tech.typeRef)) {
            typeIcon = String.fromCharCode(customIcons.schoolIcon);
        }
        else {
            typeIcon = String.fromCharCode(customIcons.titleIcon);
        }
        typeSpan.textContent = typeIcon + " " + dataManager.content.techniqueTypes[tech.typeRef].name;
        attributes.appendChild(typeSpan);

        let techRing;
        if (tech.ringRef !== "none") {
            techRing = dataManager.content.rings[tech.ringRef];
            const ringSpan = document.createElement("span");
            ringSpan.textContent = String.fromCharCode(customIcons[`${tech.ringRef}Icon`]) + " " + techRing.name;
            attributes.appendChild(ringSpan);
        }
        else if (tech.activationSet.has("tn") && (tech.activationSet.has("action") || tech.activationSet.has("downtime"))) {            
            // Create ring buttons
            const buttonContainer = document.createElement("div");
            // The first property ("any") of dataManager.content.rings is not used
            for (const buttonRingRef of Object.keys(dataManager.content.rings).splice(1, 5)) {
                const ring = dataManager.content.rings[buttonRingRef];
                const ringButton = document.createElement("button");
                ringButton.textContent = String.fromCharCode(customIcons[`${buttonRingRef}Icon`]);
                ringButton.classList.add("largeFontSize");
                if (ring === optionalRing) {
                    ringButton.classList.add("currentTab", buttonRingRef);
                    techRing = optionalRing;
                }
                ringButton.addEventListener('click', (event) => {                    
                    contentManager.consultTechnique(li, tech, ring);
                    // When the button is clicked, hideOverlay() will trigger because the event will think we clicked outside of the viewer, as the button has been deleted
                    // To prevent hideOverlay() from running, we need to stop the event from reaching overlay
                    event.stopPropagation();
                });
                buttonContainer.classList.add("buttonContainer");
                buttonContainer.appendChild(ringButton);
            }
            attributes.appendChild(buttonContainer);
        }

        if (tech.clanRef !== undefined) {
            const clanSpan = document.createElement("span");
            clanSpan.textContent = String.fromCharCode(customIcons[`${tech.clanRef}Icon`]) + " " + dataManager.content.clans[tech.clanRef].name;
            attributes.appendChild(clanSpan);
        }
        attributes.classList.add("spaceBetween", "alignCenter");
        fragment.appendChild(attributes);

        const nameSpan = document.createElement("span");        
        nameSpan.textContent = tech.name;
        nameSpan.classList.add("bold");
        const namesDiv = document.createElement("div");

        // If there is an extra name to display, the element with the name class will contain 2 spans instead of a single span
        const traditionRef = dataManager.loaded.school.traditionRef;

        if (tech.extraNames !== undefined) {
            const displayTraditionalName = traditionRef !== undefined && Object.keys(tech.extraNames).includes(traditionRef);
            const displayAbilityOrigin = tech.extraNames.abilityOrigin !== undefined;

            if (displayTraditionalName || displayAbilityOrigin) {
                const extraNameSpan = document.createElement("span");
                if (displayTraditionalName) {
                    extraNameSpan.textContent = tech.extraNames[traditionRef] + ` (${dataManager.content.traditions[traditionRef].name})`;                    
                    namesDiv.appendChild(nameSpan);
                    namesDiv.appendChild(extraNameSpan);  
                }
                if (displayAbilityOrigin) {
                    extraNameSpan.textContent = tech.extraNames.abilityOrigin;
                    namesDiv.appendChild(extraNameSpan);                
                    namesDiv.appendChild(nameSpan);
                }                
            }
            else {
                namesDiv.appendChild(nameSpan);
            }
        }
        else {
            namesDiv.appendChild(nameSpan);
        }

        namesDiv.classList.add("title", "largeFontSize", "columnContainer");
        fragment.appendChild(namesDiv);
        
        const stringArrayMap = new Map();

        const stringArrayNames = ["description", "activation", "effects", "newOpportunities"];
        for (let stringArrayName of stringArrayNames) {
            if (tech[stringArrayName] !== undefined) {
                stringArrayMap.set(stringArrayName, tech[stringArrayName]);
            }
        }

        if (tech.typeRef === "invocation") {
            stringArrayMap.set("invocationOpportunities", techRing.opportunities.invocation);
        }

        // Make a shallow copy of dataManager.content.rings.any.opportunities.general to leave the original intact after we push strings
        const generalArray = [...dataManager.content.rings.any.opportunities.general];
        if (tech.activationSet.has("tn")) {
            stringArrayMap.set("general", generalArray);
        }

        if (techRing !== undefined) {
            const conflictArray = [];
            const skillArray = [];
            const downtimeArray = [];
            const stanceArray = [];

            for (const string of techRing.opportunities.general) {
                generalArray.push(string);
            }            
            if (tech.activationSet.has("tn")) {
                // If the technique activation involves a check, it is always as an action or downtime activity

                if (tech.activationSet.has("action")) {
                    for (const string of techRing.opportunities.conflict) {
                        conflictArray.push(string);
                    }
                }
    
                if (tech.activationSet.has("action") || tech.activationSet.has("downtime")) {
                    for (const groupRef of Object.keys(dataManager.content.skillGroups)) {
                        if (tech.activationSet.has(groupRef)) {
                            if (groupRef === "martial") {
                                if (conflictArray.length === 0) {
                                    for (const string of techRing.opportunities.conflict) {
                                        conflictArray.push(string);
                                    }
                                }
                            }
                            else {
                                skillArray.push(techRing.opportunities.skillGroups[groupRef]);
                            }
                        }
                    }
                }                
    
                if (tech.activationSet.has("downtime")) {
                    for (const string of techRing.opportunities.downtime) {
                        downtimeArray.push(string);
                    }
                }
            }
            if (tech.activationSet.has("action")) {
                stanceArray.push(techRing.stanceEffect);
            }
            
            if (conflictArray.length > 0) {
                stringArrayMap.set("conflict", conflictArray);            
            }
            if (skillArray.length > 0) {
                stringArrayMap.set("skill", skillArray);
            }
            if (downtimeArray.length > 0) {
                stringArrayMap.set("downtime", downtimeArray);
            }
            if (stanceArray.length > 0) {
                stringArrayMap.set("stanceEffect", stanceArray);
            }
        }

        // Go through everything in stringArrayMap and add the corresponding elements
        for (const key of stringArrayMap.keys()) {
            if (key === "newOpportunities" || key === "invocationOpportunities" || key === "stanceEffect") {
                const opportunity = document.createElement("p");
                opportunity.textContent = dataManager.content.ui[key];
                opportunity.classList.add("opportunities", "italic", "largeFontSize");
                fragment.appendChild(opportunity);
            }
            else if (key === "general" || key === "conflict" || key === "skill" || key === "downtime") {
                const opportunity = document.createElement("p");
                opportunity.textContent = dataManager.content.ui.exampleOpportunities[key];
                opportunity.classList.add("opportunities", "italic", "largeFontSize");
                fragment.appendChild(opportunity);
            }
            const container = document.createElement("div");
            for (let string of stringArrayMap.get(key)) {
                const paragraph = document.createElement("p");
                
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
                // Arbitrary limit on bold part length set at 20 to avoid false positives
                const splitPosition = string.search(":") + 1;
                if (splitPosition > 0 && splitPosition < 20) {
                    
                    const boldSpan = document.createElement("span");
                    boldSpan.textContent = string.slice(0, splitPosition);
                    boldSpan.classList.add("bold");
                    paragraph.appendChild(boldSpan);

                    let normalString = string.slice(splitPosition, string.length);
                    /* FIX OR REMOVE THIS PART. AMONG THE ISSUES: DICEPOSITION IS INCONSISTENT, AND THIS DOESN'T WORK WHEN MARTIAL ART IS NOT SPECIFIED                    
                    if (key === "activation" && techRing !== "none") {
                        for (const skill of Object.values(dataManager.content.skills)) {
                            if (normalString.includes(skill.name)) {
                                const dicePosition = string.search(skill.name);
                                normalString = normalString.slice(0, dicePosition) + ` ${dataManager.loaded.ringMaps.all.get(techRing)} ${String.fromCharCode(customIcons.ringDieIcon)} + ${dataManager.loaded.ringMaps.all.get(skill)} ${String.fromCharCode(customIcons.skillDieIcon)}` + normalString.slice(dicePosition, string.length);
                            }
                        }
                    }
                    */
                    const normalSpan = document.createElement("span");
                    normalSpan.textContent = normalString
                    paragraph.appendChild(normalSpan);
                }
                else {
                    paragraph.textContent = string;
                }
                container.appendChild(paragraph);
            }
            fragment.appendChild(container);
        }        
        // Add the new viewer content from the completed fragment
        contentManager.viewer.appendChild(fragment);
    }

    toggleVisible() {
        contentManager.overlay.classList.toggle("visible");
        contentManager.viewer.classList.toggle("visible");
        contentManager.overlay.classList.remove("appear");
        contentManager.viewer.classList.remove("appear");
        contentManager.overlay.classList.remove("disappear");
        contentManager.viewer.classList.remove("disappear");

        if (!contentManager.overlay.classList.contains("visible")) {
            document.getElementById("main").classList.remove("disabled");
        }
    }

    hideOverlay(target) {
        if (!contentManager.viewer.contains(target)) {
            contentManager.overlay.classList.add("disappear");
            contentManager.viewer.classList.add("disappear");
            contentManager.viewer.scrollTop = 0;
        }
    }







    // ALL THE FUNCTIONS BELOW ARE FOR TESTING AND NEED TO BE REWORKED, REPLACED OR RELOCATED

    selectSchoolTEST() {

        const charSchoolRef = document.getElementById("tempSchoolDropdown").value;
        let charClanRef;

        contentManager.updateCharacterHeader(charSchoolRef, charClanRef);

        const emptyCharacter = new Character("incomplete", charClanRef, charSchoolRef, charSchoolRef, "", "", "", "", [""], [""], [""], [""], {air:1, earth:1, fire:1, water:1, void:1}, {}, [], [], 0, 0, 0, 0);
        const titleRef = "Emerald Magistrate";
        emptyCharacter.progress[titleRef] = [];
        dataManager.loaded.character = emptyCharacter;
        dataManager.updateFilteredSets(emptyCharacter);
        contentManager.displayStats();
        contentManager.filterSkills();
        contentManager.filterTechniques();
        dataManager.cacheCharacter();
        dataManager.userSettings.tempCharacterName = charSchoolRef + " incomplete";
        contentManager.loadTab();
    }

    updateCharacterHeader(charSchoolRef, charClanRef) {
        const clanColors = new Map();
        clanColors.set("crab", `hsl(220, 40%, 60%)`);
        clanColors.set("crane",`hsl(195, 60%, 60%)`);
        clanColors.set("dragon",`hsl(140, 40%, 50%)`);
        clanColors.set("lion",`hsl(45, 70%, 50%)`);
        clanColors.set("phoenix",`hsl(30, 80%, 60%)`);
        clanColors.set("scorpion",`hsl(0, 60%, 50%)`);
        clanColors.set("unicorn",`hsl(290, 40%, 60%)`);

        for (const clanRef of Object.keys(dataManager.content.clans)) {
            for (const familyRef of dataManager.content.clans[clanRef].familyRefs) {
                if (familyRef === charSchoolRef) {;
                    charClanRef = clanRef;
                    document.querySelector(':root').style.setProperty('--customColor', clanColors.get(clanRef));                    
                    document.getElementById("clanIcon").textContent = String.fromCharCode(dataManager.content.ui.customIcons[`${clanRef}Icon`]);
                }
            }
        }

        document.getElementById("tempSchoolDropdown").value = charSchoolRef;
    }

    confirm(func, param) {
        // Create a new popup window
        var popup = window.open("", "myPopup", "width=300,height=200");
      
        // Write a message to the popup window
        popup.document.write("CONFIRM CHARACTER PROGRESS");
      
        // Create three buttons in the popup window
        var button1 = popup.document.createElement("button");
        button1.innerHTML = "Free";
        button1.onclick = function() {
            func(param, true);
            popup.close();
        };        
        popup.document.body.appendChild(button1);
      
        var button2 = popup.document.createElement("button");
        button2.innerHTML = "Spend EXP";
        button2.onclick = function() {
            func(param, false);
            popup.close();
        };        
        popup.document.body.appendChild(button2);
      
        var button3 = popup.document.createElement("button");
        button3.innerHTML = "Cancel";
        button3.onclick = function() {
          // Close the popup window when the third button is clicked
          popup.close();
        };
        popup.document.body.appendChild(button3);
      }

    increaseRing(ringRef, free) {        
        const ring = dataManager.content.rings[ringRef];
        if (dataManager.loaded.ringMaps.all.get(ring) < 5) {
            const schoolRef = document.getElementById("tempSchoolDropdown").value;
            let addedString = "";
            if (free) {
                addedString = "F";
            }
            addedString += `R: ${ringRef}`;
            dataManager.loaded.character.progress[schoolRef].push(addedString);

            dataManager.updateFilteredSets(dataManager.loaded.character);
            contentManager.displayStats();
            contentManager.filterSkills();
            contentManager.filterTechniques();
            dataManager.cacheCharacter();
        }
    }

    upgradeSkill(skill, free) {
        for (const skillRef of Object.keys(dataManager.content.skills)) {
            if (dataManager.content.skills[skillRef] === skill) {
                const schoolRef = document.getElementById("tempSchoolDropdown").value;
                let addedString = "";
                if (free) {
                    addedString = "F";
                }
                addedString += `S: ${skillRef}`;
                dataManager.loaded.character.progress[schoolRef].push(addedString);

                dataManager.updateFilteredSets(dataManager.loaded.character);
                contentManager.displayStats();
                contentManager.filterSkills();
                contentManager.filterTechniques();
                dataManager.cacheCharacter();

                break;
            }
        }        
    }

    learnTechnique(technique, free) {
        for (const techRef of Object.keys(dataManager.content.techniques)) {
            if (dataManager.content.techniques[techRef] === technique) {
                const schoolRef = document.getElementById("tempSchoolDropdown").value;
                let addedString = "";
                if (free) {
                    addedString = "F";
                }
                addedString += `T: ${techRef}`;
                dataManager.loaded.character.progress[schoolRef].push(addedString);
                
                dataManager.updateFilteredSets(dataManager.loaded.character);
                contentManager.displayStats();
                contentManager.filterSkills();
                contentManager.filterTechniques();
                dataManager.cacheCharacter();
                
                break;
            }
        }
    }
}

class Character {
    constructor(givenName, clanRef, familyRef, schoolRef, giri, ninjō, relationships, personality, distinctionRefs, adversityRefs, passionRefs, anxietyRefs, startingRingRefs, startingSkillRefs, startingTechniqueRefs, itemRefs, honor, glory, status, receivedExp) {
        
        this.givenName = givenName; // string
        this.clanRef = clanRef; // string
        this.familyRef = familyRef; // string
        this.progress = {}; // object with school and titles as properties, each containing [string] with prefixes for each refString
        this.progress[schoolRef] = []; 
        this.giri = giri; // string
        this.ninjō = ninjō; // string
        this.relationships = relationships; // string
        this.personality = personality; // string
        this.distinctionRefs = distinctionRefs; // [string]
        this.adversityRefs = adversityRefs; // [string]
        this.passionRefs = passionRefs; // [string]
        this.anxietyRefs = anxietyRefs; // [string]
        this.startingRingRefs = startingRingRefs; // object with keys air earth fire water void, and int values
        this.startingSkillRefs = startingSkillRefs; // object with skillRef keys and int values
        this.startingTechniqueRefs = startingTechniqueRefs; // [string]
        this.itemRefs = itemRefs; // [[string, int]]
        this.receivedExp = receivedExp; // int

        this._honor = honor; // int
        this._glory = glory; // int
        this._status = status; // int
        this._fatigue = 0; // int
        this._strife = 0; // int
        if (startingRingRefs !== undefined) {
            this._voidPoints = Math.ceil(startingRingRefs["void"]/2); // int
        }        
    }

    get honor() {return this._honor;}
    changeHonor(difference) {this._honor = Math.min(Math.max(0, this._honor += difference), 100);}

    get glory() {return this._glory;}
    changeHonor(difference) {this._glory = Math.min(Math.max(0, this._glory += difference), 100);}

    get status() {return this._status;}
    changeHonor(difference) {this._status = Math.min(Math.max(0, this._status += difference), 100);}

    get fatigue() {return this._fatigue;}
    changeFatigue(difference) {
        this._fatigue = Math.max(0, this._fatigue += difference);
        contentManager.displayStats();
        dataManager.cacheCharacter();
    }

    get strife() {return this._strife;}
    changeStrife(difference) {
        this._strife = Math.max(0, this._strife += difference);
        contentManager.displayStats();
        dataManager.cacheCharacter();
    }

    get voidPoints() {return this._voidPoints;}
    changeVoidPoints(difference) {
        this._voidPoints = Math.min(Math.max(0, this._voidPoints += difference), dataManager.loaded.ringMaps.all.get(dataManager.content.rings["void"]));
        contentManager.displayStats();
        dataManager.cacheCharacter();
    }

    get endurance() {return (dataManager.loaded.ringMaps.all.get(dataManager.content.rings["earth"]) + dataManager.loaded.ringMaps.all.get(dataManager.content.rings["fire"]))*2;}
    get composure() {return (dataManager.loaded.ringMaps.all.get(dataManager.content.rings["earth"]) + dataManager.loaded.ringMaps.all.get(dataManager.content.rings["water"]))*2;}
    get focus() {return dataManager.loaded.ringMaps.all.get(dataManager.content.rings["fire"]) + dataManager.loaded.ringMaps.all.get(dataManager.content.rings["air"]);}
    get vigilance() {return Math.floor((dataManager.loaded.ringMaps.all.get(dataManager.content.rings["air"]) + dataManager.loaded.ringMaps.all.get(dataManager.content.rings["water"]))/2);}

    endScene() {
        this._fatigue = Math.ceil(Math.min(this._fatigue, this.endurance/2));
        this._strife = Math.ceil(Math.min(this._strife, this.composure/2));
        contentManager.displayStats();
        dataManager.cacheCharacter();
    }
    // The rest function also applies the effects of endScene before the full night's rest
    rest() {
        this._fatigue = Math.ceil(Math.min(this._fatigue, this.endurance/2));
        this._strife = Math.ceil(Math.min(this._strife, this.composure/2));
        this._fatigue = Math.max(0, this._fatigue - 2 * dataManager.loaded.ringMaps.all.get(dataManager.content.rings["water"]));
        contentManager.displayStats();
        dataManager.cacheCharacter();
    }
    unmask() {
        this._strife = 0;
        contentManager.displayStats();
        dataManager.cacheCharacter();
    }

    // CREATE A METHOD TO ADD TITLES
}

// #endregion ----------------------------------------------------------------------------------------------------

// #region Execution order ----------------------------------------------------------------------------------------------------

// Create a dataManager singleton
const dataManager = new DataManager();
// Create a contentManager singleton
const contentManager = new ContentManager(); 
contentManager.viewer.addEventListener("animationend", contentManager.toggleVisible);

// JSON caching and content object creation are done through dataManager.initialize() as an async process
dataManager.initialize().then(() => {

    contentManager.initialize(false);

    // TEMPORARY TESTING, LOADTAB IS USED AT THE END OF BOTH FUNCTIONS
    if (dataManager.userSettings.tempCharacterName !== undefined) {
        dataManager.loadCharacter(dataManager.userSettings.tempCharacterName);        
    }
    else {
        contentManager.selectSchoolTEST(); // CREATE A BAREBONES DEFAULT CHARACTER AND UPDATE FILTERED SETS, THEN DISPLAY THE TECHNIQUES BASED ON DEFAULT FILTER SETTINGS
    }
    document.getElementById("languageSelect").addEventListener('change', dataManager.changeLanguage);    

    document.getElementById("skillGroupFilter").addEventListener('change', contentManager.filterSkills);
    document.getElementById("skillRankFilter").addEventListener('change', contentManager.filterSkills);
    document.getElementById("skillAvailabilityFilter").addEventListener('change', contentManager.filterSkills);
    document.getElementById("skillCurriculaFilter").addEventListener('change', contentManager.filterSkills);

    document.getElementById("techRankFilter").addEventListener('change', contentManager.filterTechniques);
    document.getElementById("techTypeFilter").addEventListener('change', contentManager.filterTechniques);
    document.getElementById("techActivationFilter").addEventListener('change', contentManager.filterTechniques);
    document.getElementById("techRingFilter").addEventListener('change', contentManager.filterTechniques);
    document.getElementById("techAvailabilityFilter").addEventListener('change', contentManager.filterTechniques);
    document.getElementById("techCurriculaFilter").addEventListener('change', contentManager.filterTechniques);

    // ALLOW THE USER TO REPEAT THE PREVIOUS STEP WITH A NEW CHARACTER FROM ANOTHER SCHOOL, OR TO CHANGE FILTERS
    document.getElementById("tempSchoolDropdown").addEventListener('change', contentManager.selectSchoolTEST);
});

// #endregion ----------------------------------------------------------------------------------------------------
