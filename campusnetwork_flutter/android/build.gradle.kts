allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}
subprojects {
    if (project.name != "app") {
        afterEvaluate {
            val androidExt = extensions.findByName("android")
            if (androidExt != null) {
                runCatching {
                    val getSdk = androidExt.javaClass.methods.firstOrNull {
                        it.name == "getCompileSdk" && it.parameterCount == 0
                    }
                    val current = (getSdk?.invoke(androidExt) as? Number)?.toInt() ?: 0
                    if (current in 1..35) {
                        val setSdk = androidExt.javaClass.methods.firstOrNull {
                            it.name == "setCompileSdk" && it.parameterCount == 1
                        }
                        if (setSdk != null) {
                            setSdk.invoke(androidExt, 36)
                        } else {
                            val legacy = androidExt.javaClass.methods.firstOrNull {
                                it.name == "compileSdkVersion" &&
                                    it.parameterCount == 1 &&
                                    (it.parameterTypes[0] == Int::class.javaPrimitiveType ||
                                        it.parameterTypes[0] == Int::class.javaObjectType)
                            }
                            legacy?.invoke(androidExt, 36)
                        }
                    }
                }
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
